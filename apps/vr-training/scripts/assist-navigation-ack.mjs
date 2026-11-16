/** Only non-safety screen navigation may replace its source control on press. */
const targets=new Map([['open-crew','assist-answer-yes'],['open-log','assist-export-log'],['picker','assist-open-crew']]);
export function assistNavigationTarget(action) {
  return targets.get(action);
}
export function assistNavigationPressed(action, pressedNames, visibleNames) {
  const target=assistNavigationTarget(action);
  return !!target && (pressedNames.includes(`assist-${action}`) || visibleNames.includes(target));
}
