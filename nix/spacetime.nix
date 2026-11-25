# Local SpacetimeDB server for development.
#
# Enable `services.spacetime` to run `spacetime start` under `devenv up`.
# The CLI and standalone server are provided by the pinned upstream release in
# ./spacetimedb.nix, matching the crate versions in Cargo.toml.
{ config, lib, pkgs, ... }:

let
  cfg = config.services.spacetime;
  allocatedPort = config.processes.spacetime.ports.main.value;
in
{
  options.services.spacetime = {
    enable = lib.mkEnableOption "a local SpacetimeDB server";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./spacetimedb.nix { };
      defaultText = lib.literalExpression "SpacetimeDB 2.16.3 release binaries";
      description = "SpacetimeDB package providing `spacetime` and `spacetimedb-standalone`.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address the server listens on.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port the server listens on. The default matches `spacetime.json`.";
    };

    dataDir = lib.mkOption {
      type = lib.types.str;
      default = "${config.env.DEVENV_STATE}/spacetime/data";
      description = ''
        Directory for the server's database files. The CLI's own config and
        identity stay in their usual per-user locations, so commands such as
        `spacetime publish` work without extra flags.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    packages = [ cfg.package ];

    processes.spacetime = {
      ports.main.allocate = cfg.port;

      exec = ''
        mkdir -p ${lib.escapeShellArg cfg.dataDir}
        exec ${cfg.package}/bin/spacetime start \
          --listen-addr ${cfg.host}:${toString allocatedPort} \
          --data-dir ${lib.escapeShellArg cfg.dataDir} \
          --non-interactive
      '';

      ready = {
        http.get = {
          inherit (cfg) host;
          port = allocatedPort;
          path = "/v1/ping";
        };
        initial_delay = 1;
        period = 2;
        probe_timeout = 2;
        failure_threshold = 15;
      };
    };
  };
}
