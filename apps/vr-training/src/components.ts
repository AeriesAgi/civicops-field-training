/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineComponents } from '@iwsdk/core';
import { RoadsSession, RoadsTarget, RoadsTape } from './roads-components.js';
import { SceneSafetySession, SceneSafetyTarget } from './scene-safety-components.js';
import { FieldAssistTarget } from './field-assist-components.js';
import { ModuleBoard } from './module-components.js';
import { WaterSession, WaterTarget } from './water-components.js';
import { FirstMinutes, TrainingSession, TrainingTarget } from './training-components.js';

export default defineComponents([TrainingTarget, TrainingSession, FirstMinutes, ModuleBoard, WaterSession, WaterTarget, RoadsSession, RoadsTarget, RoadsTape, SceneSafetySession, SceneSafetyTarget, FieldAssistTarget]);
