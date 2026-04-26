import sys

def trace_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    curly = 0
    round_b = 0
    for i, line in enumerate(lines):
        for char in line:
            if char == '{': curly += 1
            elif char == '}': curly -= 1
            elif char == '(': round_b += 1
            elif char == ')': round_b -= 1
        
        # We only care about positive balance that doesn't resolve
        if i > 4000:
            print(f"L{i+1} | Curly: {curly} | Round: {round_b}")

if __name__ == "__main__":
    trace_balance(sys.argv[1])
