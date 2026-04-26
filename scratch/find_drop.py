import sys

def find_round_drop(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    round_b = 0
    for i, line in enumerate(lines):
        for char in line:
            if char == '(': round_b += 1
            elif char == ')': round_b -= 1
        
        # Line 11 sets it to 1. We want to see if it hits 0 before 4058.
        if i >= 10: # Start from Line 11
            if round_b == 0:
                print(f"Round balance hit 0 on line {i+1}: {line.strip()}")
                return

if __name__ == "__main__":
    find_round_drop(sys.argv[1])
