import sys

def find_unclosed_block(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    stack = []
    for i, line in enumerate(lines):
        line_num = i + 1
        for char in line:
            if char == '{':
                stack.append(line_num)
            elif char == '}':
                if stack:
                    stack.pop()
                else:
                    print(f"Extra closing brace at line {line_num}")
    
    if stack:
        print(f"Total unclosed braces: {len(stack)}")
        print(f"Braces opened but never closed (starting lines): {stack[-10:]}") # Show last 10
    else:
        print("All braces closed.")

if __name__ == "__main__":
    find_unclosed_block(sys.argv[1])
