path = r'c:\Users\yocha\Downloads\NAMMA MART\DO NOT DELETE THIS ( YOCHAN)\DO NOT DELETE THIS ( YOCHAN)\public\html\scan.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find old leftover section that starts at the duplicate inner div
old_leftover_start = '            <div style="display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 320px; margin: 0 auto 24px auto;">'
old_leftover_end_marker = '        </div>'

idx = content.find(old_leftover_start)
if idx == -1:
    print('Old leftover not found, nothing to clean')
else:
    # Find the closing tag of the old block (the button + close div block)
    # We need to remove from old_leftover_start through the closing cancel button </button>\n        </div>
    close_btn_end = '            </button>\n        </div>'
    end_idx = content.find(close_btn_end, idx)
    if end_idx == -1:
        print('Could not find end of old block')
    else:
        end_idx += len(close_btn_end)
        removed = content[idx:end_idx]
        print('Removing block:')
        print(removed[:200])
        content = content[:idx] + content[end_idx:]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Done')
