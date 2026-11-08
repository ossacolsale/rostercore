"""Run the UTF-8 JSON CLI without inherited stdin or Windows loader dialogs."""
import subprocess
import sys

if sys.platform == 'win32':
    import ctypes
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel32.GetErrorMode.argtypes = []
    kernel32.GetErrorMode.restype = ctypes.c_uint
    kernel32.SetErrorMode.argtypes = [ctypes.c_uint]
    kernel32.SetErrorMode.restype = ctypes.c_uint
    # Children inherit this mode, including failures before the CLI reaches main.
    kernel32.SetErrorMode(kernel32.GetErrorMode() | 0x0001 | 0x0002 | 0x8000)


def run_cli(cli, *args, input_text=None, timeout=60):
    command = [str(cli), *(str(arg) for arg in args)]
    streams = {'stdin': subprocess.DEVNULL} if input_text is None else {'input': input_text}
    try:
        return subprocess.run(command, capture_output=True, text=True,
                              encoding='utf-8', timeout=timeout, **streams)
    except subprocess.TimeoutExpired as error:
        raise AssertionError(
            f'CLI did not finish within {timeout}s: {command!r}. '
            'Check runtime DLLs and process startup before increasing solver limits.'
        ) from error


def process_details(process):
    code = process.returncode
    return (f'exit={code} (0x{code & 0xffffffff:08X}), '
            f'stdout={process.stdout[:1000]!r}, stderr={process.stderr[:1000]!r}')
