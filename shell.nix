{ pkgs ? import <nixpkgs> { }, pkgsUnstable }:
with pkgs;
mkShell rec {
  buildInputs = [
    nodejs_22 # This is necessary for npm
    bun
    python3
  ];
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath buildInputs;

  LANG = "C.UTF-8";
  shellHook = with pkgs; ''
  '';
}
