type ParseResult = string | string[] | DataView | number | null;
type StateResult =
  | ParseResult
  | ParseResult[]
  | Array<ParseResult | ParseResult[]>;

type ErrorParseState =
  | {
      isError: true;
      errorMessage: string;
    }
  | {
      isError: false;
    };

type ParserState = {
  index: number;
  target: string | DataView;
  result: StateResult;
} & ErrorParseState;

type ParserStateTransformerFn = (state: ParserState) => ParserState;

const LETTERS_REGEX = /^[A-Za-z]+/;
const DIGITS_REGEX = /^[0-9]+/;

const isArray = Array.isArray;

export const updateState = (
  state: ParserState,
  index: number,
  result: ParseResult
): ParserState => {
  return {
    ...state,
    index,
    result,
  };
};

export const updateResults = (
  state: ParserState,
  results: StateResult
): ParserState => {
  return {
    ...state,
    result: results,
  };
};

export const updateError = (
  state: ParserState,
  errorMessage: string
): ParserState => {
  return {
    ...state,
    errorMessage,
    isError: true,
  };
};

export class Parser {
  parserStateTransformerFn: ParserStateTransformerFn;

  constructor(parserStateTransformerFn: ParserStateTransformerFn) {
    this.parserStateTransformerFn = parserStateTransformerFn;
  }

  run(target: string | DataView) {
    const initialState: ParserState = {
      target,
      index: 0,
      result: null,
      isError: false,
    };

    const r = this.parserStateTransformerFn(initialState);
    return r;
  }

  map(fn: (parseResult: StateResult) => any) {
    return new Parser((parserState) => {
      const nextState = this.parserStateTransformerFn(parserState);

      if (nextState.isError) return nextState;

      return updateResults(nextState, fn(nextState.result));
    });
  }

  errorMap(fn: (parseResult: ParseResult, index: number) => any) {
    return new Parser((parserState) => {
      const nextState = this.parserStateTransformerFn(parserState);

      if (!nextState.isError) return nextState;

      return updateError(
        nextState,
        fn(nextState.errorMessage, nextState.index)
      );
    });
  }

  chain(fn: (type: string) => Parser) {
    return new Parser((parserState) => {
      const nextState = this.parserStateTransformerFn(parserState);

      if (nextState.isError) return nextState;

      // @ts-ignore
      const nextParser = fn(nextState.result);
      return nextParser.parserStateTransformerFn(nextState);
    });
  }
}

export const str = (s: string) =>
  new Parser((parserState: ParserState): ParserState => {
    const { index, target, isError } = parserState;
    if (isError) return parserState;

    if (typeof target === "string") {
      const slicedString = target.slice(index);

      if (slicedString.length === 0) {
        return updateError(
          parserState,
          `str: Tried to match ${s}, but got end of input`
        );
      }

      if (slicedString.startsWith(s)) {
        return updateState(parserState, index + s.length, s);
      }

      return updateError(
        parserState,
        `str: Tried to match ${s}, but got ${target.slice(
          index,
          index + s.length
        )}`
      );
    } else {
      return updateError(
        parserState,
        `str: Tried to match ${s} with non-string`
      );
    }
  });

export const letters = new Parser((parserState: ParserState): ParserState => {
  const { index, target, isError } = parserState;
  if (isError) return parserState;

  if (typeof target === "string") {
    const slicedString = target.slice(index);

    if (slicedString.length === 0) {
      return updateError(parserState, `letters: Got unexpected  end of input`);
    }

    const regexMatch = slicedString.match(LETTERS_REGEX);

    if (regexMatch) {
      return updateState(
        parserState,
        index + regexMatch[0].length,
        regexMatch[0]
      );
    }

    return updateError(
      parserState,
      `letters: Couldn't match letters at index ${index}`
    );
  } else {
    return updateError(
      parserState,
      `letters: Tried to match ${target} with non-string`
    );
  }
});

export const digits = new Parser((parserState: ParserState): ParserState => {
  const { index, target, isError } = parserState;
  if (isError) return parserState;

  if (typeof target === "string") {
    const slicedString = target.slice(index);

    if (slicedString.length === 0) {
      return updateError(parserState, `digits: Got unexpected  end of input`);
    }

    const regexMatch = slicedString.match(DIGITS_REGEX);

    if (regexMatch) {
      return updateState(
        parserState,
        index + regexMatch[0].length,
        regexMatch[0]
      );
    }

    return updateError(
      parserState,
      `digits: Couldn't match digits at index ${index}`
    );
  } else {
    return updateError(
      parserState,
      `letters: Tried to match ${target} with non-string`
    );
  }
});

export const sequenceOf = (parsers: Array<Parser>) =>
  new Parser((parseState: ParserState): ParserState => {
    if (parseState.isError) return parseState;

    const results: StateResult = [];
    let nextState = parseState;
    for (let parser of parsers) {
      nextState = parser.parserStateTransformerFn(nextState);
      if (nextState.isError) {
        return updateError(nextState, `sequenceOf: ${nextState.errorMessage}`);
      }

      if (Array.isArray(nextState.result)) {
        // @ts-ignore
        results.push(...nextState.result);
      } else {
        // @ts-ignore
        results.push(nextState.result);
      }
    }

    if (nextState.isError) {
      return nextState;
    }
    return updateResults(nextState, results);
  });

export const choice = (parsers: Array<Parser>) =>
  new Parser((parseState: ParserState): ParserState => {
    if (parseState.isError) return parseState;

    for (let parser of parsers) {
      const nextState = parser.parserStateTransformerFn(parseState);

      if (!nextState.isError) {
        return nextState;
      }
    }

    return updateError(
      parseState,
      `choice: Unable to match with any parser at index ${parseState.index}`
    );
  });

export const many = (parser: Parser) =>
  new Parser((parseState: ParserState): ParserState => {
    if (parseState.isError) return parseState;

    const results = [];
    let done = false;
    let nextState = parseState;

    while (!done) {
      const testState = parser.parserStateTransformerFn(nextState);
      if (!testState.isError) {
        results.push(testState.result);
        nextState = testState;
      } else {
        done = true;
      }
    }

    return updateResults(nextState, results);
  });

export const many1 = (parser: Parser) =>
  new Parser((parseState: ParserState): ParserState => {
    if (parseState.isError) return parseState;

    const results = [];
    let done = false;
    let nextState = parseState;

    while (!done) {
      const testState = parser.parserStateTransformerFn(nextState);
      if (!testState.isError) {
        results.push(testState.result);
        nextState = testState;
      } else {
        done = true;
      }
    }

    if (results.length === 0) {
      return updateError(
        parseState,
        `many1: Unable to match any input using parser at index ${parseState.index}`
      );
    }

    return updateResults(nextState, results);
  });

export const sepBy = (separatorParser: Parser) => (valueParser: Parser) =>
  new Parser((parserState) => {
    const results: Array<StateResult> = [];
    let nextState: ParserState = parserState;

    while (true) {
      const testState: ParserState =
        valueParser.parserStateTransformerFn(nextState);
      if (testState.isError) break;
      // @ts-ignore
      results.push(testState.result);

      nextState = testState;
      const separatorState =
        separatorParser.parserStateTransformerFn(nextState);
      if (separatorState.isError) break;

      nextState = separatorState;
    }

    // @ts-ignore
    return updateResults(nextState, results);
  });

export const sepBy1 = (separatorParser: Parser) => (valueParser: Parser) =>
  new Parser((parserState) => {
    const results: ParseResult[] = [];
    let nextState: ParserState = parserState;

    while (true) {
      const testState: ParserState =
        valueParser.parserStateTransformerFn(nextState);
      if (testState.isError) break;
      if (typeof testState.result === "string") {
        results.push(testState.result);
      }
      nextState = testState;
      const separatorState =
        separatorParser.parserStateTransformerFn(nextState);
      if (separatorState.isError) break;

      nextState = separatorState;
    }

    if (results.length < 1) {
      return updateError(
        parserState,
        `sep1: Unable to parse any results at index ${parserState.index}`
      );
    }

    return updateResults(nextState, results);
  });

export const between =
  (leftParser: Parser, rightParser: Parser) => (contentParser: Parser) =>
    sequenceOf([leftParser, contentParser, rightParser]).map((result) => {
      return typeof result == "string"
        ? result[1]
        : Array.isArray(result)
        ? result.slice(1, result.length - 1)
        : result;
    });

export const lazy = (parserThunk) =>
  new Parser((parserState) => {
    const parser: Parser = parserThunk();

    return parser.parserStateTransformerFn(parserState);
  });

export const fail = (errMsg) =>
  new Parser((parserState) => {
    return updateError(parserState, errMsg);
  });

export const succeed = (value) =>
  new Parser((parserState) => {
    return updateResults(parserState, value);
  });

export const contextual = (generatorFn) => {
  return succeed(null).chain(() => {
    const iterator = generatorFn();

    const runStep = (nextValue) => {
      const iteratorResult = iterator.next(nextValue);

      if (iteratorResult.done) {
        return succeed(iteratorResult.value);
      }

      const nextParser = iteratorResult.value;

      if (!(nextParser instanceof Parser)) {
        throw new Error("contextual: yielded values must always be parsers!");
      }

      return nextParser.chain(runStep);
    };

    // @ts-ignore
    return runStep();
  });
};

export const evaluate = (node) => {
  if (node.type === "number") {
    return node.value;
  } else if (node.type === "operation") {
    const aResult = evaluate(node.value.a);
    const bResult = evaluate(node.value.b);
    switch (node.value.op) {
      case "+":
        return aResult + bResult;
      case "-":
        return aResult - bResult;
      case "*":
        return aResult * bResult;
      case "/":
        return aResult / bResult;
    }
  }
};
