import sys

def find_mismatch(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    balance = 0
    for i, line in enumerate(lines):
        for char in line:
            if char == '(':
                balance += 1
            elif char == ')':
                balance -= 1
            
            if balance < 0:
                print(f"Mismatch found on line {i+1}: {line.strip()}")
                return
    
    print("No mismatch in nesting order (but counts might still differ if balance > 0 at end)")

if __name__ == "__main__":
    find_mismatch(sys.argv[1])
