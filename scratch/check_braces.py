import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    open_curly = content.count('{')
    close_curly = content.count('}')
    open_round = content.count('(')
    close_round = content.count(')')
    open_square = content.count('[')
    close_square = content.count(']')
    
    print(f"File: {filename}")
    print(f"Curly Braces: {{ {open_curly}, }} {close_curly} (Diff: {open_curly - close_curly})")
    print(f"Round Braces: ( {open_round}, ) {close_round} (Diff: {open_round - close_round})")
    print(f"Square Braces: [ {open_square}, ] {close_square} (Diff: {open_square - close_square})")

if __name__ == "__main__":
    check_braces(sys.argv[1])
