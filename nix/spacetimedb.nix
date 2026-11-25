# Prebuilt SpacetimeDB CLI and standalone server.
#
# nixpkgs ships an older release than the crates in this workspace, so fetch
# the upstream binaries for the exact version pinned in Cargo.toml. The CLI
# looks for `spacetimedb-standalone` next to itself, so both binaries must be
# installed into the same `bin` directory.
{
  lib,
  stdenv,
  stdenvNoCC,
  fetchurl,
  autoPatchelfHook,
  zlib,
}:

let
  version = "2.16.3";
  inherit (stdenvNoCC.hostPlatform) system;

  assets = {
    x86_64-linux = {
      name = "spacetime-x86_64-unknown-linux-gnu.tar.gz";
      hash = "sha256-4nMelWoznQGnVQCxZOeSL6PdAqcxWuzTXtItYaE/szg=";
    };
    aarch64-linux = {
      name = "spacetime-aarch64-unknown-linux-gnu.tar.gz";
      hash = "sha256-upVRiOqlDjC8uWD45Us1s3jkpkeZTW0XkF+PJq8Q/lo=";
    };
    x86_64-darwin = {
      name = "spacetime-x86_64-apple-darwin.tar.gz";
      hash = "sha256-Ih3tEqVw+XaOYgeKMsK5CLnSaUlggxG4ILzBjEhYsiU=";
    };
    aarch64-darwin = {
      name = "spacetime-aarch64-apple-darwin.tar.gz";
      hash = "sha256-SLWNmTnaH/ClRnze2xbbg6lZBG/K/wjpyzL2l7yKcRw=";
    };
  };

  asset =
    assets.${system}
      or (throw "SpacetimeDB ${version} release binaries are not available for ${system}");
in
stdenvNoCC.mkDerivation {
  pname = "spacetimedb";
  inherit version;

  src = fetchurl {
    url = "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${version}/${asset.name}";
    inherit (asset) hash;
  };

  nativeBuildInputs = lib.optional stdenvNoCC.hostPlatform.isLinux autoPatchelfHook;
  buildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [
    zlib
    stdenv.cc.cc.lib
  ];

  dontConfigure = true;
  dontBuild = true;
  dontStrip = true;
  sourceRoot = ".";

  installPhase = ''
    runHook preInstall

    install -Dm755 spacetimedb-cli "$out/bin/spacetime"
    install -Dm755 spacetimedb-standalone "$out/bin/spacetimedb-standalone"

    runHook postInstall
  '';

  meta = {
    description = "SpacetimeDB command-line tool and local standalone server";
    homepage = "https://spacetimedb.com";
    license = lib.licenses.bsl11;
    mainProgram = "spacetime";
    platforms = builtins.attrNames assets;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
