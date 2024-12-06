type ParseResult = string | null;

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
  targetString: string;
  result: ParseResult | ParseResult[];
} & ErrorParseState;

type ParserStateTransformerFn = (state: ParserState) => ParserState;

const LETTERS_REGEX = /^[A-Za-z]+/;
const DIGITS_REGEX = /^[0-9]+/;

const isArray = Array.isArray;

const updateState = (
  state: ParserState,
  index: number,
  result: ParseResult | ParseResult[]
): ParserState => {
  return {
    ...state,
    index,
    result,
  };
};

const updateResults = (
  state: ParserState,
  results: ParseResult | ParseResult[]
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

  run(targetString: string) {
    const initialState: ParserState = {
      index: 0,
      targetString,
      result: null,
      isError: false,
    };

    const r = this.parserStateTransformerFn(initialState);
    return r;
  }

  map(fn: (parseResult: ParseResult | ParseResult[]) => any) {
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
    const { index, targetString, isError } = parserState;
    if (isError) return parserState;

    const slicedString = targetString.slice(index);

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
      `str: Tried to match ${s}, but got ${targetString.slice(
        index,
        index + s.length
      )}`
    );
  });

const letters = new Parser((parserState: ParserState): ParserState => {
  const { index, targetString, isError } = parserState;
  if (isError) return parserState;

  const slicedString = targetString.slice(index);

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
});

const digits = new Parser((parserState: ParserState): ParserState => {
  const { index, targetString, isError } = parserState;
  if (isError) return parserState;

  const slicedString = targetString.slice(index);

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
});

const sequenceOf = (parsers: Array<Parser>) =>
  new Parser((parseState: ParserState): ParserState => {
    if (parseState.isError) return parseState;

    const results: ParseResult[] = [];
    let nextState = parseState;
    for (let parser of parsers) {
      nextState = parser.parserStateTransformerFn(nextState);
      if (nextState.isError) {
        return updateError(nextState, `sequenceOf: ${nextState.errorMessage}`);
      }

      if (isArray(nextState.result)) {
        results.push(...nextState.result);
      } else {
        results.push(nextState.result);
      }
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

    const r = updateResults(nextState, results);
    return r;
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
        : result.slice(1, result.length - 1);
    });

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

const betweenSquareBrackets = between(str("["), str("]"));
const commaSeparated = sepBy(str(","));
const value = choice([digits, parser]);

const exampleString = "[1,[2,[3],4],5]";
const parser = betweenSquareBrackets(commaSeparated(digits));

console.log(parser.run("[1,2,3,4,5]"));
