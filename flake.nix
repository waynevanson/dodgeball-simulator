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
    devenv = {
      url = "github:cachix/devenv/v2.4.0";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs =
    { self, nixpkgs, devenv, ... }@inputs:
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
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = devenv.lib.mkShell {
            inherit inputs pkgs;
            modules = [ ./devenv.nix ];
          };
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.biome);
    };
}
