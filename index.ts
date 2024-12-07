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

const updateState = (
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

const updateResults = (
  state: ParserState,
  results: StateResult
): ParserState => {
  return {
    ...state,
    result: results,
  };
};

const updateError = (state: ParserState, errorMessage: string): ParserState => {
  return {
    ...state,
    errorMessage,
    isError: true,
  };
};

class Parser {
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

      if (typeof nextState.result === "string") {
        const nextParser = fn(nextState.result);
        return nextParser.parserStateTransformerFn(nextState);
      }
    });
  }
}

const str = (s: string) =>
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

const letters = new Parser((parserState: ParserState): ParserState => {
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

const digits = new Parser((parserState: ParserState): ParserState => {
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

const sequenceOf = (parsers: Array<Parser>) =>
  new Parser((parseState: ParserState): ParserState => {
    if (parseState.isError) return parseState;

    const results: StateResult = [];
    let nextState = parseState;
    for (let parser of parsers) {
      nextState = parser.parserStateTransformerFn(nextState);
      if (nextState.isError) {
        return updateError(nextState, `sequenceOf: ${nextState.errorMessage}`);
      }

      if (
        !isArray(nextState.result) &&
        (typeof nextState.result === "string" ||
          typeof nextState.result === "number")
      ) {
        // @ts-ignore
        results.push(nextState.result);
      } else {
        // @ts-ignore
        results.push(...nextState.result);
      }
    }

    if (nextState.isError) {
      return nextState;
    }
    return updateResults(nextState, results);
  });

const choice = (parsers: Array<Parser>) =>
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

const many = (parser: Parser) =>
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

const many1 = (parser: Parser) =>
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

const sepBy = (separatorParser: Parser) => (valueParser: Parser) =>
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

const sepBy1 = (separatorParser: Parser) => (valueParser: Parser) =>
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

const between =
  (leftParser: Parser, rightParser: Parser) => (contentParser: Parser) =>
    sequenceOf([leftParser, contentParser, rightParser]).map((result) => {
      return typeof result == "string"
        ? result[1]
        : Array.isArray(result)
        ? result.slice(1, result.length - 1)
        : result;
    });

const lazy = (parserThunk) =>
  new Parser((parserState) => {
    const parser: Parser = parserThunk();

    return parser.parserStateTransformerFn(parserState);
  });

const evaluate = (node) => {
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

// const parser = sequenceOf([str("hello there!"), str("goodbye there!")]);
// const parser = str("hello there!");
// const parser = str("hellohello")
//   .map((v) =>
//     typeof v === "string"
//       ? { value: v.toUpperCase() }
//       : v.map((s) => ({ value: s.toUpperCase() }))
//   )
//   .errorMap((result, index) => {
//     console.log(result, index);
//     return result;
//   });

// console.log(parser.run("hello there!goodbye there!"));
// const parser = many1(choice([letters, digits]));
// const betweenBrackets = between(str("("), str(")"));

// const parser = betweenBrackets(letters);

// const stringParser = letters.map((r) => ({
//   type: "string",
//   value: r,
// }));

// const numberParser = digits.map((r) => ({
//   type: "number",
//   value: r,
// }));

// const diceParser = sequenceOf([digits, str("d"), digits]).map((r) => ({
//   type: "diceroll",
//   value: [Number(r[0]), Number(r[2])],
// }));

// const parser = sequenceOf([letters, str(":")])
//   .map((r) => r[0])
//   .chain((type) => {
//     if (type === "string") {
//       return stringParser;
//     } else if (type === "number") {
//       return numberParser;
//     }
//     return diceParser;
//   });

// console.log(parser.run("diceoll:2d8"));

// const betweenSquareBrackets = between(str("["), str("]"));
// const commaSeparated = sepBy(str(","));
// const value = lazy(() => choice([digits, parser]));

// const exampleString = "[1,[2,[3],4],5]";
// const parser = betweenSquareBrackets(commaSeparated(value));

// console.log(parser.run(exampleString));

// const numberParser = digits.map((value) => ({
//   value: Number(value),
//   type: "number",
// }));
// const operatorParser = choice([str("+"), str("-"), str("*"), str("/")]);
// const betweenBracketsParser = between(str("("), str(")"));
// const expr = lazy(() => choice([numberParser, operationParser]));
// const operationParser = betweenBracketsParser(
//   sequenceOf([operatorParser, many1(str(" ")), expr, many1(str(" ")), expr])
// ).map((result) => ({
//   type: "operation",
//   value: {
//     op: result[0],
//     a: result[2],
//     b: result[4],
//   },
// }));
// const program = "(+ (* 10 2) (- (/ 50 3) 2))";

// const interpreter = (program) => {
//   const parseResult = operationParser.run(program);

//   if (parseResult.isError) {
//     throw new Error("Invalid program");
//   }

//   return evaluate(parseResult.result);
// };

// console.log(interpreter(program));

const Bit = new Parser((parserState) => {
  if (parserState.isError) {
    return parserState;
  }

  if (parserState.target instanceof DataView) {
    const byteOffset = Math.floor(parserState.index / 8);

    if (byteOffset >= parserState.target.byteLength) {
      return updateError(parserState, `Bit: Unexpected end of input`);
    }

    const byte = parserState.target.getUint8(byteOffset);
    const bitOffset = 7 - (parserState.index % 8);

    const result = (byte & (1 << bitOffset)) >> bitOffset;

    return updateState(parserState, parserState.index + 1, result);
  }
});

const Zero = new Parser((parserState) => {
  if (parserState.isError) {
    return parserState;
  }

  if (parserState.target instanceof DataView) {
    const byteOffset = Math.floor(parserState.index / 8);

    if (byteOffset >= parserState.target.byteLength) {
      return updateError(parserState, `Zero: Unexpected end of input`);
    }

    const byte = parserState.target.getUint8(byteOffset);
    const bitOffset = 7 - (parserState.index % 8);

    const result = (byte & (1 << bitOffset)) >> bitOffset;

    if (result !== 0) {
      return updateError(
        parserState,
        `Zero: expected to get 0, but got ${result} at index ${parserState.index}`
      );
    }

    return updateState(parserState, parserState.index + 1, result);
  }
});

const One = new Parser((parserState) => {
  if (parserState.isError) {
    return parserState;
  }

  if (parserState.target instanceof DataView) {
    const byteOffset = Math.floor(parserState.index / 8);

    if (byteOffset >= parserState.target.byteLength) {
      return updateError(parserState, `One: Unexpected end of input`);
    }

    const byte = parserState.target.getUint8(byteOffset);
    const bitOffset = 7 - (parserState.index % 8);

    const result = (byte & (1 << bitOffset)) >> bitOffset;

    if (result !== 1) {
      return updateError(
        parserState,
        `One: expected to get 1, but got ${result} at index ${parserState.index}`
      );
    }

    return updateState(parserState, parserState.index + 1, result);
  }
});

const parser = sequenceOf([One, One, One, Zero, One, Zero, One, Zero]);

const data = new Uint8Array([234, 235]).buffer;
const dataView = new DataView(data);

const res = parser.run(dataView);

console.log(res);
