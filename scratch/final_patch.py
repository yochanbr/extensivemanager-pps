
import os

js_path = r'c:\Users\yocha\Downloads\NAMMA MART\DO NOT DELETE THIS ( YOCHAN)\DO NOT DELETE THIS ( YOCHAN)\public\js\admin.js'

with open(js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Add Employee submission logic to ensure camelCase keys (Line 1476 approx)
old_add_cleanup = """            data['start-time'] = convertTo24h(data['start-hour'], data['start-min'], data['start-period']);
            data['end-time'] = convertTo24h(data['end-hour'], data['end-min'], data['end-period']);

            // Cleanup temp 12h fields
            ['start-hour', 'start-min', 'start-period', 'end-hour', 'end-min', 'end-period'].forEach(f => delete data[f]);

            data['working-days'] = formData.getAll('working-days').join(',');"""

new_add_cleanup = """            data['startTime'] = convertTo24h(data['start-hour'], data['start-min'], data['start-period']);
            data['endTime'] = convertTo24h(data['end-hour'], data['end-min'], data['end-period']);
            data['workingDays'] = formData.getAll('working-days').join(',');
            data['employeeId'] = data['employee-id'];

            // Legacy compatibility
            data['start-time'] = data['startTime'];
            data['end-time'] = data['endTime'];
            data['working-days'] = data['workingDays'];

            // Cleanup temp 12h fields
            ['start-hour', 'start-min', 'start-period', 'end-hour', 'end-min', 'end-period'].forEach(f => delete data[f]);"""

if old_add_cleanup in content:
    content = content.replace(old_add_cleanup, new_add_cleanup)
    print("Fixed Add submission logic.")
else:
    print("Could not find Add submission markers.")

# 2. Update Edit populate logic (Line 1830 approx in new version) to handle relationship fallback
# (It's already in the patch but checking)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Final patch complete.")
