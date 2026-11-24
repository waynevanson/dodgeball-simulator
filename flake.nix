{
  description = "Dodgeball Simulator: Rust simulation core, TypeScript canvas presentation";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    # SpacetimeDB 2.16 cannot parse the wasm emitted by binaryen 133.
    # nixos-26.05 provides binaryen 129, which it can parse.
    nixpkgs-binaryen.url = "github:NixOS/nixpkgs/nixos-26.05";
  };

  outputs =
    {
      nixpkgs,
      fenix,
      nixpkgs-binaryen,
      ...
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          rust = fenix.packages.${system}.fromToolchainFile {
            file = ./rust-toolchain.toml;
            sha256 = "sha256-A1abGIbOtcBSdrUMhDGrER3pRM1hQP4fp9gh3Y4PKc8=";
          };
          binaryen129 = (import nixpkgs-binaryen { inherit system; }).binaryen;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.pnpm
              pkgs.biome
              rust
              # Must match the pinned `wasm-bindgen` crate version; the
              # unversioned attribute moves ahead with nixpkgs and wasm-bindgen
              # refuses to run when the CLI and crate schema differ.
              pkgs.wasm-bindgen-cli_0_2_121
              binaryen129
              # SpacetimeDB: install the CLI matching `spacetimedb` in Cargo.toml.
              # nixpkgs currently ships 2.15.0, while the module and npm client
              # are pinned to 2.16.1. Use the upstream installer or publish with
              # `--bin-path target/wasm32-unknown-unknown/release/dodgeball_server.wasm`.
            ];
          };
        }
      );

      formatter = forAllSystems (system: (import nixpkgs { inherit system; }).biome);
    };
}
