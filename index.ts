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
  };
  return parser(initialState);
};

const parser = sequenceOf([str("hello there!"), str("goodbye there!")]);

console.log(run(parser, "hello there!goodbye there!"));
