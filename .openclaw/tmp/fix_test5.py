import sys
lines = open(sys.argv[1], "r").readlines()
# Add try { after the verify connection's }); and before await conn.execute
for i in range(len(lines)):
    if i > 515 and lines[i].strip() == '});':
        if i+1 < len(lines) and 'await conn.execute' in lines[i+1]:
            lines.insert(i+1, '      try {\n')
            print(f"Inserted try {{ at line {i+2}")
            break
with open(sys.argv[1], "w") as f:
    f.writelines(lines)

# Verify
lines2 = open(sys.argv[1], "r").readlines()
for i in range(len(lines2)):
    if i > 515 and i < 530:
        print(f"  {i+1}: {repr(lines2[i][:80])}")
PYEOF
