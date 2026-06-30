// FFI for the CLI: process argv (minus node + script) and the exit code.
export const argv = () => process.argv.slice(2);

export const setExitCode = (code) => () => {
  process.exitCode = code;
};
