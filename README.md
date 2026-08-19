# Circuit / InductEx Project

This project processes SPICE circuit netlists and layout files, generates InductEx-compatible circuit files, updates extracted component values when a `sol.txt` file is available, and produces data used by the web-based schematic interface.

The main Python entry point is:

```text
main.py
```

The web interface is located at:

```text
UI/main_page.html
```

## 1. Create the virtual environment

Run these commands from the project root.

### Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

If your system uses `python` instead of `python3`:

```bash
python -m venv .venv
source .venv/bin/activate
```

### Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### Windows Command Prompt

```cmd
python -m venv .venv
.venv\Scripts\activate.bat
```

## 2. Install the dependencies

After activating the virtual environment:

```bash
pip install -r requirements.txt
```

## 3. Run the Python program

With the virtual environment activated:

```bash
python main.py
```

On some Linux systems, use:

```bash
python3 main.py
```

The program will ask you to select the circuit project to run.

## 4. Start the local web server

Open a second terminal in the project root and activate the virtual environment if needed.

Start the server on port `8080`:

```bash
python -m http.server 8080
```

On Linux, if `python` is not available:

```bash
python3 -m http.server 8080
```

Then open this address in your browser:

```text
http://localhost:8080/UI/main_page.html
```

## 5. Use another port

You can replace `8080` with another available port.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/UI/main_page.html
```

Another example:

```bash
python -m http.server 3000
```

and open:

```text
http://localhost:3000/UI/main_page.html
```

## Typical workflow

### Linux

Terminal 1:

```bash
source .venv/bin/activate
python main.py
```

Terminal 2:

```bash
source .venv/bin/activate
python -m http.server 8080
```

Open:

```text
http://localhost:8080/UI/main_page.html
```

### Windows PowerShell

Terminal 1:

```powershell
.\.venv\Scripts\Activate.ps1
python main.py
```

Terminal 2:

```powershell
.\.venv\Scripts\Activate.ps1
python -m http.server 8080
```

Open:

```text
http://localhost:8080/UI/main_page.html
```

## Deactivate the virtual environment

When finished:

```bash
deactivate
```
