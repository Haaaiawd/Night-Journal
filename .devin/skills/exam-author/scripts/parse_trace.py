import json, sys
sys.stdout.reconfigure(encoding='utf-8')
for run in [1, 2, 3]:
    print(f"\n=== RUN {run} ===")
    with open(rf'D:\PROJECTALL\Talent_eval\ssrf-webhook\eval\trace_run{run}.json', 'rb') as f:
        data = f.read()
        if data.startswith(b'\xff\xfe'):
            data = data[2:]
        text = data.decode('utf-16-le', errors='replace')
    for line in text.splitlines():
        line = line.strip()
        if not line or not line.startswith('{'):
            continue
        try:
            obj = json.loads(line)
        except:
            continue
        if obj.get('type') != 'tool_use':
            continue
        tool = obj.get('part', {}).get('tool', '')
        if tool == 'edit':
            inp = obj['part']['state']['input']
            print(f'EDIT: {inp["filePath"]}')
            print(f'OLD: {repr(inp["oldString"][:200])}')
            print(f'NEW: {repr(inp["newString"][:200])}')
        elif tool == 'bash':
            inp = obj['part']['state']['input']
            out = obj['part']['state'].get('output', '')
            print(f'BASH: {inp.get("command", "")[:100]}')
            print(f'OUT: {repr(out[:200])}')
