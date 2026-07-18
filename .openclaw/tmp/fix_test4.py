import sys
lines = open(sys.argv[1], "r").readlines()
# Remove the duplicate try { that appears before "const conn = "
for i in range(len(lines)):
    if 'try {' in lines[i] and i+1 < len(lines) and 'const conn = await' in lines[i+1]:
        print(f"Line {i+1}: removing try {{ before conn =")
        lines.pop(i)
        break
with open(sys.argv[1], "w") as f:
    f.writelines(lines)
print("Done")
