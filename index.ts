type ParseResult = string | null;

type ParserState = {
  index: number;
  targetString: string;
  result: ParseResult;
};

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

    throw new Error(
      `Tried to match ${s}, but got ${targetString.slice(0, 10)}`
    );
  };

const run = (parser: Function, targetString: string) => {
  const initialState: ParserState = {
    index: 0,
    targetString,
    result: null,
  };
  return parser(initialState);
};

const parser = str("hello there!");

console.log(run(parser, "hello there!"));
