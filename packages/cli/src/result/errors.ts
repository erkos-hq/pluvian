/** The failure track: operational failures only (doc 06, Rule 1). */

export interface RuleValidationError {
  readonly ruleIndex: number
  readonly problem: string
}

export type EngineError =
  | { readonly kind: 'ConfigNotFound'; readonly path: string }
  | {
      readonly kind: 'ConfigInvalid'
      readonly path: string
      readonly detail: string
    }
  | {
      readonly kind: 'VersionMismatch'
      readonly required: string
      readonly running: string
    }
  | {
      readonly kind: 'SpecLoadFailed'
      readonly path: string
      readonly detail: string
    }
  | { readonly kind: 'SpecInvalid'; readonly errors: RuleValidationError[] }
  | { readonly kind: 'PathNotFound'; readonly path: string }
  | {
      readonly kind: 'ParseFailed'
      readonly file: string
      readonly detail: string
    }
