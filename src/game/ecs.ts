import { EcsWorld } from '../ecs/core';
import type { System as GenericSystem, TickContext } from '../ecs/core';
import type { GameComponents, GameResources } from './components/registry';

export type { Entity } from '../ecs/core';

export type World = EcsWorld<GameComponents, GameResources>;

export type System = GenericSystem<GameComponents, GameResources>;

export type Context = TickContext<GameComponents, GameResources>;

export const createWorld = (): World => new EcsWorld<GameComponents, GameResources>();
