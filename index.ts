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
  result: ParseResult;
} & ErrorParseState;

const str =
  (s: string) =>
  (parserState: ParserState): ParserState => {
    const { index, targetString } = parserState;
    if (targetString.startsWith(s, index)) {
      return {
        ...parserState,
        result: s,
        index: index + s.length,
      };
    }

    return {
      ...parserState,
      isError: true,
      message: `Tried to match ${s}, but got ${targetString.slice(0, 10)}`,
    };
  };

const sequenceOf =
  (parsers: Function[]) =>
  (parseState: ParserState): ParserState[] => {
    const results: ParserState[] = [];
    parsers.reduce((acc, curr) => {
      const result = curr(acc);
      results.push(result);
      return result;
    }, parseState);

    return results;
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

console.log(run(parser, "hello there!"));
