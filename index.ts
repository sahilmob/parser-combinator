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
  results: ParseResult[]
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

    return this.parserStateTransformerFn(initialState);
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

// const parser = sequenceOf([str("hello there!"), str("goodbye there!")]);
const parser = str("hello there!");

console.log(parser.run("hello there!goodbye there!"));
