
import subprocess

def check_java_version():
    try:
        # Run the 'java -version' command
        result = subprocess.run(['java', '-version'], stderr=subprocess.PIPE, text=True)
        # Java version information is in the stderr output
        output = result.stderr
        # Extract the version number
        if 'version' in output:
            version_line = output.splitlines()[0]
            java_version = version_line.split('"')[1]
            print(f"Java version: {java_version}")
        else:
            print("Java version could not be determined.")
    except FileNotFoundError:
        print("Java is not installed or not in the system PATH.")

check_java_version()