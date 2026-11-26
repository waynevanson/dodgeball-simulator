# devenv module for the developer shell.
#
# Consumed by `devenv.lib.mkShell` in flake.nix. `inputs` is the consuming
# flake's input set, injected as a module argument by devenv's flake
# integration, so the fenix and binaryen inputs stay declared in flake.nix.
{ pkgs, inputs, lib, ... }:

let
  inherit (pkgs.stdenv.hostPlatform) system;

  rust = inputs.fenix.packages.${system}.fromToolchainFile {
    file = ./rust-toolchain.toml;
    sha256 = "sha256-A1abGIbOtcBSdrUMhDGrER3pRM1hQP4fp9gh3Y4PKc8=";
  };

  binaryen129 = (import inputs.nixpkgs-binaryen { inherit system; }).binaryen;

  # Bevy/winit dlopen these at runtime, so native cargo binaries need them on
  # LD_LIBRARY_PATH while running from the dev shell.
  runtimeLibs =
    with pkgs;
    [
      wayland
      libxkbcommon
      openssl
      systemd
    ]
    ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [ alsa-lib vulkan-loader ];
in
{
  imports = [ ./nix/spacetime.nix ];

  enterShell = ''
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath runtimeLibs}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

    # NixOS keeps the active Vulkan ICDs outside the dev shell's library path.
    if [ -d /run/opengl-driver/share/vulkan/icd.d ] && [ -z "''${VK_ICD_FILENAMES:-}" ]; then
      icds=""
      for icd in /run/opengl-driver/share/vulkan/icd.d/*_icd."$(uname -m)".json; do
        [ -e "$icd" ] || continue
        icds="''${icds:+$icds:}$icd"
      done
      if [ -n "$icds" ]; then
        export VK_ICD_FILENAMES="$icds"
      fi
    fi
  '';

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
    # Must match the pinned `wasm-bindgen` crate version; wasm-bindgen refuses
    # to generate glue when the CLI and crate schema versions differ.
    pkgs.wasm-bindgen-cli_0_2_130
  ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
    # cpal/rodio link against ALSA for native Bevy audio.
    pkgs.alsa-lib
  ];
}
