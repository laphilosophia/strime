import { DirectiveRegistry } from './directives';
import { StructuralMismatchError } from './errors';
import { SelectionMap } from './parser';
import { Token, Tokenizer, TokenType } from './tokenizer';

export class Engine {
  private tokenizer = new Tokenizer();
  private selectionStack: (boolean | any)[] = [];
  private resultStack: any[] = [];
  private keyStack: (string | null)[] = [];

  private currentKey: string | null = null;
  private skipDepth = 0;
  private isArrayStack: boolean[] = [];
  private onMatch?: (data: any) => void;
  private debug = false;

  constructor(private initialSelection: SelectionMap, options?: { debug?: boolean, onMatch?: (data: any) => void }) {
    this.debug = options?.debug ?? false;
    this.onMatch = options?.onMatch;
    this.tokenizer = new Tokenizer(undefined, options);
    this.selectionStack.push({ selection: initialSelection });
  }

  private trace(msg: string) {
    if (this.debug) console.log(`[Engine] ${msg}`);
  }

  public reset() {
    this.tokenizer.reset();
    this.selectionStack = [{ selection: this.initialSelection }];
    this.resultStack = [];
    this.keyStack = [];
    this.currentKey = null;
    this.skipDepth = 0;
    this.isArrayStack = [];
  }

  public execute(source: Uint8Array): any {
    this.processChunk(source);
    return this.getResult();
  }

  public processChunk(chunk: Uint8Array) {
    this.tokenizer.processChunk(chunk, (token) => {
      this.handleToken(token);
    });
  }

  public getResult(): any {
    return this.resultStack[0];
  }

  private handleToken(token: Token) {
    if (this.skipDepth > 0) {
      if (token.type === TokenType.LEFT_BRACE || token.type === TokenType.LEFT_BRACKET) {
        this.skipDepth++;
        this.trace(`Skip depth increase: ${this.skipDepth}`);
      } else if (token.type === TokenType.RIGHT_BRACE || token.type === TokenType.RIGHT_BRACKET) {
        this.skipDepth--;
        this.trace(`Skip depth decrease: ${this.skipDepth}`);
      }
      return;
    }

    this.trace(`Token: ${TokenType[token.type]} value: ${token.value}`);

    switch (token.type) {
      case TokenType.LEFT_BRACE: this.onStructureStart(false); break;
      case TokenType.RIGHT_BRACE: this.onStructureEnd(); break;
      case TokenType.LEFT_BRACKET: this.onStructureStart(true); break;
      case TokenType.RIGHT_BRACKET: this.onStructureEnd(); break;
      case TokenType.STRING:
        if (this.expectingKey()) {
          this.currentKey = token.value as string;
        } else {
          this.onValue(token.value);
        }
        break;
      case TokenType.NUMBER:
      case TokenType.TRUE:
      case TokenType.FALSE:
      case TokenType.NULL:
        this.onValue(token.value ?? this.getLiteralValue(token.type));
        break;
    }
  }

  private expectingKey(): boolean {
    return !this.isArray() && this.currentKey === null;
  }

  private isArray(): boolean {
    return this.isArrayStack[this.isArrayStack.length - 1] || false;
  }

  private onStructureStart(isArray: boolean) {
    const parent = this.selectionStack[this.selectionStack.length - 1];
    let currentSelection: any = false;
    let targetKey = this.currentKey;

    if (this.isArrayStack.length === 0) {
      currentSelection = parent;
      this.resultStack.push(isArray ? [] : {});
    } else if (this.isArray()) {
      const parentResult = this.resultStack[this.resultStack.length - 1];
      if (!Array.isArray(parentResult)) {
        throw new StructuralMismatchError(`Expected array at depth ${this.resultStack.length}`);
      }
      currentSelection = parent;
      const newObj = isArray ? [] : {};
      parentResult.push(newObj);
      this.resultStack.push(newObj);
    } else if (this.currentKey && parent && parent.selection && parent.selection[this.currentKey]) {
      const config = parent.selection[this.currentKey];
      currentSelection = typeof config === 'boolean' ? { selection: {} } : config;
      targetKey = currentSelection.alias || this.currentKey;

      if (currentSelection) {
        const parentResult = this.resultStack[this.resultStack.length - 1];
        if (typeof parentResult !== 'object' || parentResult === null || Array.isArray(parentResult)) {
          throw new StructuralMismatchError(`Expected object at depth ${this.resultStack.length} for key '${targetKey}'`);
        }
        const newObj = isArray ? [] : {};
        parentResult[targetKey!] = newObj;
        this.resultStack.push(newObj);
      } else {
        this.skipDepth = 1;
      }
    } else {
      this.skipDepth = 1;
    }

    this.selectionStack.push(currentSelection);
    this.isArrayStack.push(isArray);
    this.keyStack.push(targetKey);
    this.currentKey = null;
  }

  private onStructureEnd() {
    const selection = this.selectionStack.pop();
    this.isArrayStack.pop();

    // Handle @default for missing keys in objects
    if (selection !== false && !this.isArray() && selection.selection) {
      const result = this.resultStack[this.resultStack.length - 1];
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        for (const [key, config] of Object.entries(selection.selection)) {
          const conf = config as any;
          const targetKey = conf.alias || key;
          if (!(targetKey in result)) {
            if (conf.directives) {
              const defaultValue = this.applyDirectives(undefined, conf.directives);
              if (defaultValue !== undefined) {
                result[targetKey] = defaultValue;
              }
            }
          }
        }
      }
    }

    if (selection !== false && this.resultStack.length > 1) {
      const finishedItem = this.resultStack.pop();
      // If we are at depth 1 (root array item completion), emit match
      if (this.resultStack.length === 1 && this.isArrayStack[0] && this.onMatch) {
        this.onMatch(finishedItem);
      }
    }
    this.keyStack.pop();
    this.currentKey = null;
  }

  private onValue(value: any) {
    const parent = this.selectionStack[this.selectionStack.length - 1];

    if (this.isArray()) {
      const parentResult = this.resultStack[this.resultStack.length - 1];
      if (!Array.isArray(parentResult)) {
        throw new StructuralMismatchError(`Expected array at depth ${this.resultStack.length} for value`);
      }
      // For arrays, if selection is boolean true or an object with no explicit fields but maybe directives
      if (parent.selection || parent === true || parent.directives) {
        parentResult.push(this.applyDirectives(value, parent.directives));
      }
    } else if (this.currentKey && parent.selection && parent.selection[this.currentKey]) {
      const parentResult = this.resultStack[this.resultStack.length - 1];
      if (typeof parentResult !== 'object' || parentResult === null || Array.isArray(parentResult)) {
        throw new StructuralMismatchError(`Expected object at depth ${this.resultStack.length} for key '${this.currentKey}'`);
      }
      const config = parent.selection[this.currentKey];
      const targetKey = config.alias || this.currentKey;
      const finalValue = this.applyDirectives(value, config.directives);
      parentResult[targetKey] = finalValue;
    }

    this.currentKey = null;
  }

  private applyDirectives(value: any, directives?: any[]): any {
    if (!directives) return value;
    let result = value;
    for (const d of directives) {
      result = DirectiveRegistry.execute(d.name, result, d.args);
    }
    return result;
  }

  private getLiteralValue(type: TokenType): any {
    if (type === TokenType.TRUE) return true;
    if (type === TokenType.FALSE) return false;
    return null;
  }
}
