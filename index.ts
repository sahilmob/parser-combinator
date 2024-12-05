type ParseResult = string | null;

type ErrorParseState =
  | {
      isError: true;
      message: string;
    }
  | {
      isError: false;
    };

type ParserState = {
  index: number;
  targetString: string;
  result: ParseResult | ParseResult[];
} & ErrorParseState;

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

const updateError = (state: ParserState, errorMsg: string): ParserState => {
  return {
    ...state,
    isError: true,
    message: errorMsg,
  };
};

const str =
  (s: string) =>
  (parserState: ParserState): ParserState => {
    const { index, targetString, isError } = parserState;
    if (isError) return parserState;

    const slicedString = targetString.slice(index);

    if (slicedString.length === 0) {
      return updateError(
        parserState,
        `str: Tried to match ${s}, but got end of input.`
      );
    }

    if (slicedString.startsWith(s, index)) {
      return updateState(parserState, index + s.length, s);
    }

    return updateError(
      parserState,
      `str: Tried to match ${s}, but got ${targetString.slice(0, 10)}.`
    );
  };

const sequenceOf =
  (parsers: Array<(state: ParserState) => ParserState>) =>
  (parseState: ParserState): ParserState => {
    if (parseState.isError) return parseState;

    const results: ParseResult[] = [];
    const nextState = parsers.reduce((acc, curr) => {
      const result = curr(acc);
      if (isArray(result.result)) {
        results.push(...result.result);
      } else {
        results.push(result.result);
      }
      return result;
    }, parseState);

    return updateResults(nextState, results);
  };

const run = (parser: Function, targetString: string) => {
  const initialState: ParserState = {
    index: 0,
    targetString,
    result: null,
    isError: false,
  };
  return parser(initialState);
};

// const parser = sequenceOf([str("hello there!"), str("goodbye there!")]);
const parser = str("hello there!");

console.log(run(parser, "hello there!goodbye there!"));
