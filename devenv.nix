# devenv module for the developer shell.
#
# Consumed by `devenv.lib.mkShell` in flake.nix. `inputs` is the consuming
# flake's input set, injected as a module argument by devenv's flake
# integration, so the fenix and binaryen inputs stay declared in flake.nix.
{ pkgs, inputs, ... }:

let
  inherit (pkgs.stdenv.hostPlatform) system;

  rust = inputs.fenix.packages.${system}.fromToolchainFile {
    file = ./rust-toolchain.toml;
    sha256 = "sha256-A1abGIbOtcBSdrUMhDGrER3pRM1hQP4fp9gh3Y4PKc8=";
  };

  binaryen129 = (import inputs.nixpkgs-binaryen { inherit system; }).binaryen;
in
{
  imports = [ ./nix/spacetime.nix ];

  # `devenv up` starts the local SpacetimeDB server on port 3000.
  services.spacetime.enable = true;

  packages = [
    pkgs.nodejs_22
    pkgs.pnpm
    pkgs.biome
    pkgs.pkg-config
    pkgs.wayland
    pkgs.libxkbcommon
    pkgs.openssl
    pkgs.systemd
    rust
    binaryen129
    # The SpacetimeDB CLI and standalone server come from services.spacetime,
    # pinned to the crate version in Cargo.toml.
  ];
}
