import { type GuidanceMode } from './guidance.js';
import { currentStep, type ProcedureState, type StepId } from './procedure.js';
import {
  INSTRUCTOR_LINE_BY_ID, INSTRUCTOR_SCRIPT, outcomeLine,
  type InstructorLineId, type StepLineKind,
} from './instructor-script.js';
import { BrowserSpeechVoice, LocalInstructorVoice, type InstructorVoice, type VoiceLine } from './instructor-voice.js';

export {
  INSTRUCTOR_LINES, STEP_CAPTIONS, INSTRUCTOR_SCRIPT, INSTRUCTOR_LINE_BY_ID,
  outcomeLine, procedureMessageId,
} from './instructor-script.js';
export type { GeneralLineId, InstructorLine, InstructorLineId, StepLineKind } from './instructor-script.js';
export type { InstructorVoice } from './instructor-voice.js';

export interface Instructor {
  sayStep(stepId: string): void;
  say(line: string): void;
  dispose(): void;
}

export interface ScriptedInstructorOptions {
  voice?: InstructorVoice;
  speechEnabled?: boolean;
  volume?: number;
  guidance?: GuidanceMode;
}

/** Captions are immediate and always available; local speech is the default voice. */
export class ScriptedInstructor implements Instructor {
  private disposed = false;
  private readonly voice: InstructorVoice;
  readonly guidance: GuidanceMode;

  constructor(
    private readonly onCaption: (line: string) => void,
    options: boolean | ScriptedInstructorOptions = {},
  ) {
    const config = typeof options === 'boolean' ? { speechEnabled: options } : options;
    this.guidance = config.guidance === 'unguided' ? 'unguided' : 'guided';
    this.voice = config.voice ?? (config.speechEnabled === false
      ? new BrowserSpeechVoice(false) : new LocalInstructorVoice());
    this.voice.setVolume(config.volume ?? 0.7);
  }

  sayStep(stepId: string): void {
    if (this.guidance === 'unguided') return;
    this.sayStepKind(stepId, 'instruction');
  }

  sayInstruction(text: string): void { if (this.guidance !== 'unguided') this.say(text); }

  sayHint(stepId: string): void { this.sayStepKind(stepId, 'hint'); }
  sayWhy(stepId: string): void { this.sayStepKind(stepId, 'why'); }
  saySuccess(stepId: string): void { this.sayStepKind(stepId, 'success'); }

  private sayStepKind(stepId: string, kind: StepLineKind): void {
    if (stepId in INSTRUCTOR_SCRIPT.steps) this.deliver(INSTRUCTOR_SCRIPT.steps[stepId as StepId][kind]);
  }

  sayLine(id: InstructorLineId): void { this.deliver(INSTRUCTOR_LINE_BY_ID[id]); }

  sayOutcome(previous: ProcedureState, next: ProcedureState, advanceInstruction = true): InstructorLineId | undefined {
    const line = outcomeLine(previous, next);
    if (line) {
      const step = currentStep(next);
      const instruction = advanceInstruction && this.guidance !== 'unguided' && line.id.endsWith('.success') && step && step.id in INSTRUCTOR_SCRIPT.steps
        ? INSTRUCTOR_SCRIPT.steps[step.id as StepId].instruction : undefined;
      if (instruction && !this.disposed) {
        this.onCaption(`${line.text} ${instruction.text}`);
        this.voice.speak(line);
        this.voice.speak(instruction, true);
      } else this.deliver(line);
    }
    return line?.id;
  }

  say(text: string): void {
    const line = Object.values(INSTRUCTOR_LINE_BY_ID).find((entry) => entry.text === text);
    this.deliver(line ?? { id: 'local-caption', text });
  }

  private deliver(line: VoiceLine | undefined): void {
    if (this.disposed || !line) return;
    this.onCaption(line.text);
    this.voice.speak(line);
  }

  unlock(): void { if (!this.disposed) this.voice.unlock(); }
  stop(): void { this.voice.stop(); }
  setVolume(volume: number): void { this.voice.setVolume(volume); }
  dispose(): void { this.disposed = true; this.voice.dispose(); }
}

export interface InstructorStepState { stepId: StepId | null; completed: boolean; failed: boolean; }
export interface InstructorClientTools {
  get_step_state(): InstructorStepState;
  highlight_object(objectId: string): void;
  repeat_demo(): void;
  explain_why(): void;
}

/** Local tools only. The future conversation adapter opens no connection and holds no key. */
export class ElevenLabsAgentInstructor extends ScriptedInstructor {
  readonly implemented = false;
  readonly clientTools: InstructorClientTools;

  constructor(onCaption: (line: string) => void, tools?: Partial<InstructorClientTools>) {
    super(onCaption, false);
    this.clientTools = {
      get_step_state: tools?.get_step_state ?? (() => ({ stepId: null, completed: false, failed: false })),
      highlight_object: tools?.highlight_object ?? (() => {}),
      repeat_demo: tools?.repeat_demo ?? (() => {}),
      explain_why: tools?.explain_why ?? (() => {}),
    };
  }
}
