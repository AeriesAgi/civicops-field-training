import type { TrainingModule } from '../contracts';
import { elecLotoModule } from './elec-loto';
import { roadsZoneModule } from './roads-zone';
import { sceneSafetyModule } from './scene-safety';
import { waterBurstModule } from './water-burst';

/** One shared scoring/certificate engine consumes each department's pure definition. */
export function trainingModuleById(moduleId: string): TrainingModule | undefined {
  return moduleId === elecLotoModule.id ? elecLotoModule
    : moduleId === waterBurstModule.id ? waterBurstModule
      : moduleId === roadsZoneModule.id ? roadsZoneModule
        : moduleId === sceneSafetyModule.id ? sceneSafetyModule
          : undefined;
}

export function defaultCrewForModule(module: TrainingModule): string {
  return module.id === 'scene-safety' ? 'fire-01' : module.serviceCodes.includes('WATER') ? 'water-01' : module.serviceCodes.includes('ROADS') ? 'roads-01' : 'electricity-01';
}
