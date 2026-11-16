/** Replacing a pressed target can turn the same held gesture into another action. */
export class ChoiceReleaseQueue<T> {
  private pending?:T[];
  request(choices:T[],pressed:boolean):T[]|undefined {
    if(pressed){this.pending=choices;return undefined;}
    this.pending=undefined;return choices;
  }
  release(stillPressed:boolean):T[]|undefined {
    if(stillPressed)return undefined;
    const choices=this.pending;this.pending=undefined;return choices;
  }
  clear():void{this.pending=undefined;}
}
