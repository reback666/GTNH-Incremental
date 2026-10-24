import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { HIGH_RISK_REACTOR_MODEL as ID } from '../src/game/constants';
import { serialize, deserialize } from '../src/game/save';
import { dec } from '../src/numeric/decimal';
import { modelById } from './helpers';

function factory() {
  const core = new GameCore();
  core.maxTier = 10;
  core.counts = { [ID]: 2, 'c-10': 100, 'm-1': 1 };
  core.ores[9] = dec('1e12');
  core.pollutionEnabled = false;
  core.grid = 'stable';
  core.random = () => 0;
  return core;
}

describe('明确确认的高风险设施', () => {
  it('默认安全，必须有设备并明确确认后才启用', () => {
    const core = factory();
    const model = modelById(ID);
    const rated = core.generatorOutputRated(model);
    const fuel = core.generatorFuelRateOf(model);
    expect(core.setReactorRisk(true)).toBe(false);
    expect(core.reactorRiskArmed).toBe(false);
    expect(core.setReactorRisk(true, true)).toBe(true);
    expect(core.generatorOutputRated(model).eq(rated.times('1.5'))).toBe(true);
    expect(core.generatorFuelRateOf(model).eq(fuel.times('1.5'))).toBe(true);
    expect(new GameCore().setReactorRisk(true, true)).toBe(false);
  });

  it('事故只损失指定机型一台，不波及其他设备或库存', () => {
    const core = factory();
    core.setReactorRisk(true, true);
    core.tick(600);
    expect(core.lastReport.reactorAccidents).toBe(1);
    expect(core.countOf(ID)).toBe(1);
    expect(core.countOf('c-10')).toBe(100);
    expect(core.countOf('m-1')).toBe(1);
    expect(core.ores[9]!.gt(0)).toBe(true);
  });

  it('停机或无燃料不积累风险，关开和存读档不重置累计暴露', () => {
    const core = factory();
    core.setReactorRisk(true, true);
    core.random = () => 0.99;
    core.tick(100);
    const exposure = core.reactorRiskExposure;
    expect(exposure).toBeGreaterThan(0);
    core.stopped[ID] = true;
    core.tick(100);
    expect(core.reactorRiskExposure).toBe(exposure);
    delete core.stopped[ID];
    core.ores[9] = dec('0');
    core.tick(100);
    expect(core.reactorRiskExposure).toBe(exposure);
    core.setReactorRisk(false);
    core.setReactorRisk(true, true);
    const restored = deserialize(serialize(core));
    expect(restored.reactorRiskArmed).toBe(true);
    expect(restored.reactorRiskExposure).toBe(exposure);
  });

  it('安全模式不发生永久事故，卖光或转生后不会自动重新启用', () => {
    const core = factory();
    core.tick(600);
    expect(core.countOf(ID)).toBe(2);
    expect(core.lastReport.reactorAccidents).toBe(0);
    core.setReactorRisk(true, true);
    core.sell(modelById(ID), 2);
    expect(core.reactorRiskArmed).toBe(false);
    const next = factory();
    next.setReactorRisk(true, true);
    expect(next.rebirth('rift')).not.toBeNull();
    expect(next.reactorRiskArmed).toBe(false);
    expect(next.reactorRiskExposure).toBe(0);
  });
});
