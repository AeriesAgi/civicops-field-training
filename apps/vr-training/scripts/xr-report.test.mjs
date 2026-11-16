import { describe, expect, it } from 'vitest';
import { aggregateReports } from './xr-report.mjs';

const report = module => ({ revision: 'same-source', changedFiles: '', passed: true,
  limitations: ['No physical-device claim'], modules: [{ module, passed: true }], observations: [], captures: [] });

describe('XR suite evidence', () => {
  it('keeps a partial suite unpassed and includes only current checkpoints', () => {
    const result = aggregateReports(['electrical', 'water'], ['electrical'], [report('elec-loto')]);
    expect(result.passed).toBe(false);
    expect(result.modules.map(m => m.module)).toEqual(['elec-loto']);
  });
  it('passes only after every requested case completes', () => {
    expect(aggregateReports(['electrical', 'water'], ['water', 'electrical'], [report('water-burst'), report('elec-loto')]).passed).toBe(true);
  });
  it('allows documentation/report updates while rejecting changed app or hand-input files',()=>{
    const a={...report('elec-loto'),changedFiles:'M docs/BUILD_PROGRESS.md'};
    const b={...report('water-burst'),changedFiles:'M docs/DEMO_VIDEO.md\n M apps/vr-training/scripts/xr-report.mjs'};
    expect(aggregateReports(['electrical','water'],['electrical','water'],[a,b]).passed).toBe(true);
    for(const path of ['src/training-system.ts','public/models/roads-cone.glb','scripts/xr-driver.mjs']){
      expect(()=>aggregateReports(['electrical','water'],['electrical','water'],[a,{...b,changedFiles:`M apps/vr-training/${path}`}])).toThrow();
    }
  });
  it('rejects failed, duplicate, unexpected and mixed-source checkpoints', () => {
    expect(() => aggregateReports(['electrical'], ['electrical'], [{ ...report('elec-loto'), passed: false }])).toThrow();
    expect(() => aggregateReports(['electrical'], ['water'], [report('water-burst')])).toThrow();
    expect(() => aggregateReports(['water'], ['water'], [report('elec-loto')])).toThrow();
    expect(() => aggregateReports(['electrical'], ['electrical', 'electrical'], [report('elec-loto'), report('elec-loto')])).toThrow();
    expect(() => aggregateReports(['electrical', 'water'], ['electrical', 'water'], [report('elec-loto'), { ...report('water-burst'), revision: 'stale-source' }])).toThrow();
  });
  it('allows only named standalone still tools, retaining native hand/sanitizer checks',()=>{
    const a=report('elec-loto');
    const b={...report('water-burst'),changedFiles:['capture-round6-roads.mjs','capture-round6-taxi.mjs','review-round6.sh','report-round6.mjs'].map(f=>`M apps/vr-training/scripts/${f}`).join('\n')};
    expect(aggregateReports(['electrical','water'],['electrical','water'],[a,b]).passed).toBe(true);
    for(const path of ['e2e-xr.mjs','e2e-ar.mjs','xr-driver.mjs','xr-command.mjs','capture-round4.mjs','run-e2e-xr.sh','assist-navigation-ack.mjs','room-ray-origin.mjs']){
      expect(()=>aggregateReports(['electrical','water'],['electrical','water'],[a,{...b,changedFiles:b.changedFiles+`\nM apps/vr-training/scripts/${path}`}])).toThrow('runtime working trees');
    }
  });
  it('normalises app-relative git status while permitting only round-7 camera/source-review tools',()=>{
    const a={...report('elec-loto'),changedFiles:'?? scripts/preview-round7-taxi.mjs'};
    const b={...report('water-burst'),changedFiles:' M scripts/review-round7.sh\n?? scripts/report-round7.mjs\n?? scripts/capture-round7-electrical.mjs\n?? scripts/review-round7-sky.sh\n?? tools/blender/review-taxi-lods.py'};
    expect(aggregateReports(['electrical','water'],['electrical','water'],[a,b]).passed).toBe(true);
    for(const path of ['scripts/xr-driver.mjs','scripts/capture-round4.mjs','src/street-life-system.ts','tools/blender/prepare-library-actors.py']){
      expect(()=>aggregateReports(['electrical','water'],['electrical','water'],[a,{...b,changedFiles:b.changedFiles+`\n M ${path}`}])).toThrow('runtime working trees');
    }
  });

});
