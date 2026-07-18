import sys
lines = open(sys.argv[1], "r").readlines()
# Find the "});" before the verify block's finally
for i in range(len(lines)):
    if i > 515 and lines[i].strip() == '});' and i+1 < len(lines) and 'finally' not in lines[i+1] and 'try' not in lines[i+1]:
        print(f"Line {i+1}: }}) with next: {repr(lines[i+1][:60])}")
        # Check if next line is "await conn.execute"
        if i+1 < len(lines) and 'await conn.execute' in lines[i+1]:
            lines.insert(i+1, '      try {\n')
            print(f"Inserted try {{ at line {i+2}")
            break
with open(sys.argv[1], "w") as f:
    f.writelines(lines)
print("Done")
