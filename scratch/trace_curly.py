import sys

def trace_curly(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    curly = 0
    for i, line in enumerate(lines):
        for char in line:
            if char == '{': curly += 1
            elif char == '}': curly -= 1
        
        if i >= 3850 and i <= 3870: 
             print(f"L{i+1} | Curly: {curly}")

if __name__ == "__main__":
    trace_curly(sys.argv[1])
