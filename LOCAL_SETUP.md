# Run Atelier on your computer

Install **Python 3.12 or newer** from https://www.python.org/downloads/ if needed. The app uses only Python's standard library: no npm, pip installation, virtual environment, database server, or build step is required. On Windows, install the Python launcher when offered.

The project repository is https://github.com/MichaelWirthlin/QUIZLET-ARTHISTORY. Once the app has been uploaded there, use **Code → Download ZIP** to get the source. Extract the ZIP, rename the extracted folder to `QUIZLET-ARTHISTORY`, and put that folder in your Downloads folder so the commands below match exactly. The project includes the source and bundled sample image; API keys and your private artwork database are not committed.

If Git is installed, you can instead run these commands from a directory where you want the project:

```sh
git clone https://github.com/MichaelWirthlin/QUIZLET-ARTHISTORY.git
cd QUIZLET-ARTHISTORY
```

If you used Git to download the project, stay in that folder and skip the Downloads-folder `cd` command below.

## macOS or Linux

After extracting the project into Downloads, run in Terminal:

```sh
cd "$HOME/Downloads/QUIZLET-ARTHISTORY"
python3 --version
```

Confirm Python reports version 3.12 or newer.

To start with AI enabled, run these commands in Bash or Zsh:

```sh
{
  printf 'OpenAI API key (hidden): '
  read -r -s ART_STUDY_API_KEY
  printf '\n'
  export ART_STUDY_API_KEY
  python3 server.py
}
```

Paste the key when the terminal waits after the prompt and press Enter. The key will not display or become part of the command history. It is held in the terminal's process environment and inherited by the app; these commands do not write it into any project file.

## Windows PowerShell

After extracting the project into Downloads, run in PowerShell:

```powershell
Set-Location "$HOME\Downloads\QUIZLET-ARTHISTORY"
py -3 --version
```

Confirm Python reports version 3.12 or newer. Then start with AI:

```powershell
& {
  $artStudySecret = Read-Host "OpenAI API key" -AsSecureString
  $env:ART_STUDY_API_KEY = [System.Net.NetworkCredential]::new("", $artStudySecret).Password
  Remove-Variable artStudySecret
  py -3 server.py
}
```

Paste the key at the hidden prompt and press Enter. PowerShell passes it to the app as an environment variable without writing it into a source file or command history. The app needs the environment variable's plaintext value to authenticate, so treat this terminal session as private.

## Open and use the app

Leave the terminal running and open **http://127.0.0.1:3000** in your browser. Choose **Connect AI → Check AI connection** to verify the key and model access. The default model is `gpt-4.1-mini`.

Create an API key at https://platform.openai.com/api-keys if needed. OpenAI API billing is separate from a ChatGPT subscription. The local app and manual/self-review features do not require paid hosting; AI calls use your OpenAI API account.

To run without setting up AI, use `python3 server.py` on macOS/Linux or `py -3 server.py` on Windows. The editor, local collection, bundled sample, and self-review quizzes work without a key.

Press **Ctrl+C** in the terminal to stop. To start again in that same terminal, run the server command again. In a new terminal, repeat the hidden key prompt if you want AI enabled. Restart the server after changing the key.

Your collection is stored in `.data/studio.sqlite` inside the project folder. That file contains your notes and images: preserve or back it up to keep your collection. `.gitignore` excludes `.data/` and `.env`. The current server does **not** automatically load `.env`; using the environment-variable commands above requires no `.env` file. Never put a key into `server.py`, browser JavaScript, a Git commit, or a chat message.

If port 3000 is busy, stop the app using that port, or use an alternate port:

```sh
# macOS / Linux
PORT=3001 python3 server.py
```

```powershell
# Windows PowerShell
$env:PORT = "3001"
py -3 server.py
```

Then open http://127.0.0.1:3001 instead. The app stays bound to your own computer by default and has no login system; keep the default loopback binding for personal use.
