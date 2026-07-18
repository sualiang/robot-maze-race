import sys

lines = open(sys.argv[1], "r").readlines()

# Fix the broken manual verify connection block
# Scan for the broken pattern: password line followed by try {
for i, line in enumerate(lines):
    if 'password: decodeURIComponent(parsedUrl.password)' in line and i < len(lines)-1:
        # Check if next line has 'try {' (wrong position)
        if i + 1 < len(lines) and lines[i+1].strip().startswith('try {'):
            print(f"Found broken block at line {i+1}")
            # Replace from the 'try {' to the next 'try {'
            # Current: password, try, });
            # Should be: password, database, });
            
            # Find the associated mysql require start
            start_i = i
            while start_i > 0 and 'mysql = require' not in lines[start_i]:
                start_i -= 1
            
            print(f"  Block starts at line {start_i+1}")
            
            # Build correct block
            correct = """const parsedUrl = new URL(process.env.DATABASE_URL || "mysql://robot_maze_race:RobotRace2026!Pass@localhost:3307/robot_maze_race");
      const conn = await mysql.createConnection({
        host: parsedUrl.hostname,
        port: parseInt(parsedUrl.port || "3306"),
        user: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
        database: parsedUrl.pathname.slice(1),
      });"""
            
            # Replace from start_i to i (inclusive of the try{ lines etc)
            # Find where the block ends (next 'try {')
            end_i = i + 1
            while end_i < len(lines) and 'try {' not in lines[end_i]:
                end_i += 1
            # Include the correct try {
            end_i += 1
            
            # Find the correct indent
            indent = lines[start_i][:len(lines[start_i]) - len(lines[start_i].lstrip())]
            
            replacement_lines = [
                f"{indent}const mysql = require(\"mysql2/promise\");\n",
                f"{indent}const parsedUrl = new URL(process.env.DATABASE_URL || \"mysql://robot_maze_race:RobotRace2026!Pass@localhost:3307/robot_maze_race\");\n",
                f"{indent}const conn = await mysql.createConnection({{\n",
                f"{indent}  host: parsedUrl.hostname,\n",
                f"{indent}  port: parseInt(parsedUrl.port || \"3306\"),\n",
                f"{indent}  user: decodeURIComponent(parsedUrl.username),\n",
                f"{indent}  password: decodeURIComponent(parsedUrl.password),\n",
                f"{indent}  database: parsedUrl.pathname.slice(1),\n",
                f"{indent}}});\n",
            ]
            
            # Find the real indentation for the connection block lines
            conn_indent = "      "  # 6 spaces based on the file
            replacement_lines = [
                f"{conn_indent}const mysql = require(\"mysql2/promise\");\n",
                f"{conn_indent}const parsedUrl = new URL(process.env.DATABASE_URL || \"mysql://robot_maze_race:RobotRace2026!Pass@localhost:3307/robot_maze_race\");\n",
                f"{conn_indent}const conn = await mysql.createConnection({{\n",
                f"{conn_indent}  host: parsedUrl.hostname,\n",
                f"{conn_indent}  port: parseInt(parsedUrl.port || \"3306\"),\n",
                f"{conn_indent}  user: decodeURIComponent(parsedUrl.username),\n",
                f"{conn_indent}  password: decodeURIComponent(parsedUrl.password),\n",
                f"{conn_indent}  database: parsedUrl.pathname.slice(1),\n",
                f"{conn_indent}}});\n",
            ]
            
            # Replace old lines from start_i to the end of broken block
            # Find where the next try { is
            next_try = end_i
            # Actually we need to find the line after });
            insert_pos = start_i
            
            # Delete lines from start_i to just before "try {" that follows the broken });
            # Find "});" line
            found_close = False
            for j in range(i, min(i+10, len(lines))):
                if lines[j].strip() == '});':
                    found_close = True
                    # The try { is at j+1
                    # Keep the try { at j+1  
                    replace_end = j
                    break
            
            if found_close:
                # replace lines from start_i to replace_end (inclusive) with replacement_lines
                old_lines = lines[start_i:replace_end+1]
                lines[start_i:replace_end+1] = replacement_lines
                print(f"  Replaced lines {start_i+1}-{replace_end+1} ({len(old_lines)} lines -> {len(replacement_lines)} lines)")
            else:
                print("  Could not find }); after password line!")
            
            break  # only fix first occurrence

with open(sys.argv[1], "w") as f:
    f.writelines(lines)

print("Done")
