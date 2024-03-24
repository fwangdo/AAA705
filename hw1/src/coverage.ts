import {
  Range,
  getString,
  log,
  warn,
  todo,
  parse,
  createExpr,
  createSeqExpr,
  createStmt,
  createBlockStmt,
  toBlockStmt,
  createReturnStmt,
  prependStmt,
} from './helper';

import dedent from 'dedent-js';

import acorn from 'acorn';
import {
  Node,
  Function,
  Statement,
  BlockStatement,
  LogicalExpression,
  VariableDeclaration,
  AssignmentPattern,
  SwitchStatement,
  IfStatement,
  ConditionalExpression,
  Expression,
} from 'acorn';
import walk from 'acorn-walk';

import { generate } from 'escodegen';
import { count } from 'console';

//additional. 
import {
  VariableDeclarator
} from 'acorn';
import { allowedNodeEnvironmentFlags } from 'process';

// Coverage target
interface CoverageTarget {
  [key: number]: Range;
}

// Covered set
export class CoverSet {
  covered: Set<number>;
  target: CoverageTarget;
  total: number;

  constructor(target: CoverageTarget) {
    this.covered = new Set();
    this.target = target;
    this.total = Object.keys(target).length;
  }

  // Add a covered id
  add = (id: number): void => {
    this.covered.add(id);
  }

  // Conversion to string
  toString = (
    showDetail: boolean = false,
    code: string | undefined = undefined,
  ): string => {
    const { covered, target, total } = this;
    const { size } = covered;
    const ratio = (size / total) * 100;
    const ids = Object.keys(target).map(Number);
    const sorted = Array.from(ids).sort((a, b) => a - b);
    let str = `${size}/${total} (${ratio.toFixed(2)}%)`;
    if (showDetail) {
      for (const id of sorted) {
        str += '\n' + ('      ') + (covered.has(id) ? '*' : ' ');
        const range = target[id];
        str += ` ${id}: ${target[id]}`;
        if (code) {
          const { start, end } = range;
          str += ' -- ' + code.substring(start.index, end.index);
        }
      }
    }
    return `${str}`;
  }
}

// Coverage of the code by statement and branch
export class Coverage {
  code: string;
  modified: string;
  runner?: () => void;
  func: CoverSet;
  stmt: CoverSet;
  branch: CoverSet;

  constructor(code: string) {
    // Parse the code
    let ast = parse(code);

    // Counters for functions, statements, and branches
    let fcount = 0, scount = 0, bcount = 0;

    // Coverage targets
    let funcTarget: CoverageTarget = {};
    let stmtTarget: CoverageTarget = {};
    let branchTarget: CoverageTarget = {};

    // Recursive visitor for the AST
    const visitor: walk.RecursiveVisitors<any> = {
      Function(func) {
        const { id, params, body } = func
        for (const param of params) { walk.recursive(param, null, visitor); }
        const fid = fcount++;
        funcTarget[fid] = Range.fromNode(code, func);
        const countStmt = createStmt(`__cov__.func.add(${fid});`)

        if (body.type === 'BlockStatement') {
          const blockStmt = body as BlockStatement;
          const stmts = blockStmt.body;
          blockStmt.body = walkStmts(stmts);
          blockStmt.body.unshift(countStmt);
        } else { // Expression. 
          walk.recursive(body, null, visitor)
          const sid = scount++;
          stmtTarget[sid] = Range.fromNode(code, body);
          const countExpr = createExpr(`__cov__.stmt.add(${sid});`)
          const countFunc = createExpr(`__cov__.func.add(${fid});`)
          const newExpr = createSeqExpr([countFunc, countExpr, body])
          func.body = newExpr
        }
      },
      VariableDeclaration(decl) { // stmt 
        const { type, declarations, kind } = decl;
        for (const curDecl of declarations) { 
          const sid = scount++;
          stmtTarget[sid] = Range.fromNode(code, curDecl);
          const countExpr = createExpr(`__cov__.stmt.add(${sid});`)
          
          // main
          const { type:t2, id, init } = curDecl;
          if (init) {
            walk.recursive(init, null, visitor)
            const newDecl = createSeqExpr([countExpr, init])
            curDecl.init = newDecl
          } else {
            const newDecl = countExpr
            curDecl.init = newDecl
          }
        }
      },
      AssignmentPattern(pattern) { // stmt
        const { type, left, right } = pattern;
        const sid = scount++;
        stmtTarget[sid] = Range.fromNode(code, pattern);
        const countExpr = createExpr(`__cov__.stmt.add(${sid});`)

        // main
        const newDecl = createSeqExpr([countExpr, right])
        pattern.right = newDecl
      },
      BlockStatement(node) {
        node.body = walkStmts(node.body);
      },
      SwitchStatement(stmt) { // branch 
        const { type, discriminant, cases } = stmt;
        
        for (const c of cases) { 
          const bid = bcount++;
          branchTarget[bid] = Range.fromNode(code, c);
          
          const { type:t2, test, consequent  } = c;
          const countStmt = createStmt(`__cov__.branch.add(${bid});`);
          c.consequent = walkStmts(consequent);
          c.consequent.unshift(countStmt);
        }
      },
      StaticBlock(node) { 
        node.body = walkStmts(node.body);
      }, 
      IfStatement(stmt) { // branch 
        const { type, test, consequent, alternate } = stmt;

        // test. 
        walk.recursive(test, null, visitor)

        // if case.
        const blockConsequent = toBlockStmt(consequent)
        stmt.consequent = blockConsequent
        walk.recursive(blockConsequent, null, visitor) 
        const bid1 = bcount++;
        branchTarget[bid1] = Range.fromNode(code, consequent);
        const countStmt = createStmt(`__cov__.branch.add(${bid1});`)
        const genConsequent = prependStmt(countStmt, blockConsequent)
        stmt.consequent = genConsequent

        // else case. 
        const bid2 = bcount++;
        const countStmt2 = createStmt(`__cov__.branch.add(${bid2});`)
        if (alternate) {
          branchTarget[bid2] = Range.fromNode(code, alternate);
          const blockAlternate = toBlockStmt(alternate)
          stmt.alternate = blockAlternate
          walk.recursive(blockAlternate, null ,visitor)
          const newAlternate = prependStmt(countStmt2, blockAlternate)
          stmt.alternate = newAlternate
        } else {
          branchTarget[bid2] = Range.fromNodeToLast(code, consequent) 
          const newAlternate = prependStmt(countStmt2, null)
          stmt.alternate = newAlternate
        } 
      }, 
      ConditionalExpression(expr) { // branch . 
        const { type, test, alternate, consequent } = expr;
        const bid1 = bcount++;
        walk.recursive(consequent, null, visitor);
        const bid2 = bcount++;
        walk.recursive(alternate, null, visitor);
        branchTarget[bid1] = Range.fromNode(code, consequent);
        branchTarget[bid2] = Range.fromNode(code, alternate);
        const countExpr1 = createExpr(`__cov__.branch.add(${bid1});`)
        const countExpr2 = createExpr(`__cov__.branch.add(${bid2});`)
        const newConsequent = createSeqExpr([countExpr1, consequent])
        const newAlternate = createSeqExpr([countExpr2, alternate])
        expr.consequent = newConsequent
        expr.alternate = newAlternate
      }, 
      LogicalExpression(node) { // branch 
        const { type, operator, left, right } = node;
        if (left.type == 'LogicalExpression') {
          walk.recursive(left, null, visitor);
        } else {
          const bid1 = bcount++;
          branchTarget[bid1] = Range.fromNode(code, left);
          const countExpr1 = createExpr(`__cov__.branch.add(${bid1});`)
          const newLeft = createSeqExpr([countExpr1, left])
          node.left = newLeft
        }
        if (right.type == 'LogicalExpression') {
          walk.recursive(right, null, visitor);
        } else {
          const bid2 = bcount++;
          branchTarget[bid2] = Range.fromNode(code, right);
          const countExpr2 = createExpr(`__cov__.branch.add(${bid2});`)
          const newRight = createSeqExpr([countExpr2, right])
          node.right = newRight
        }
      }, 
      LabeledStatement(node) { 
        const { label, body } = node; 
        walk.recursive(body, null, visitor)
      },
      WhileStatement(node) { 
        const { test, body } = node;
        walk.recursive(body, null, visitor)
      },
      DoWhileStatement(node) { 
        const { body, test } = node;
        walk.recursive(body, null, visitor)
        walk.recursive(test, null, visitor)
      },
      ForStatement(node) { 
        const { type, init, test, update, body } = node;
        if (!(!init)) {
          walk.recursive(init, null, visitor)
        }
        if (!(!test)) {
          walk.recursive(test, null, visitor)
        }
        if (!(!update)) {
          walk.recursive(update, null, visitor)
        }
        walk.recursive(body, null, visitor)
      },
      ForInStatement(node) { 
        const { type, left, right, body } = node;
        walk.recursive(left, null, visitor)
        walk.recursive(right, null, visitor)
        walk.recursive(body, null, visitor)
      },
      ForOfStatement(node) { 
        const { type, left, right, body, await } = node;
        walk.recursive(left, null, visitor)
        walk.recursive(right, null, visitor)
        walk.recursive(body, null, visitor)
      },
    }

    // Instrument the sequence of statements
    function walkStmts(stmts: Statement[]): Statement[] {
      let newStmts = [];
      for (const stmt of stmts) {
        if (!stmt.type.endsWith('Declaration')) {
          const sid = scount++;
          stmtTarget[sid] = Range.fromNode(code, stmt);
          newStmts.push(createStmt(`__cov__.stmt.add(${sid});`));
        }
        newStmts.push(stmt);
        walk.recursive(stmt, null, visitor);
      }
      return newStmts;
    }

    // Recursively visit the AST
    walk.recursive(ast, null, visitor);

    // Fill the fields of the coverage object
    this.code = code;
    this.modified = generate(ast);
    this.func = new CoverSet(funcTarget);
    this.stmt = new CoverSet(stmtTarget);
    this.branch = new CoverSet(branchTarget);
    try {
      this.runner = eval(`(() => {
        const __cov__ = this;
        const orig = ${this.modified};
        function func() {
          try { return orig.apply(null, arguments); } catch (e) { }
        };
        return func;
      })();`);
    } catch(_) { warn('The given code is not runnable with arguments.'); }
  }

  // Run the instrumented code with the inputs
  run = (inputs: any[]): void => {
    for (const input of inputs) this.runSingle(input);
  }

  // Run the instrumented code with a single input
  runSingle = (input: any): void => {
    if (this.runner) this.runner.apply(null, input);
    else warn('The given code is not runnable with arguments.');
  }

  // Conversion to string
  toString = (
    showModified: boolean = false,
    showDetail: boolean = false,
  ): string => {
    const { code, func: f, stmt: s, branch: b } = this;
    let str: string = '';
    if (showModified) str += `Modified: ${this.modified}\n`;
    str += `Coverage:` + '\n';
    if (f.total > 0) str += `- func: ${f.toString(showDetail)}\n`;
    if (s.total > 0) str += `- stmt: ${s.toString(showDetail)}\n`;
    if (b.total > 0) str += `- branch: ${b.toString(showDetail)}\n`;
    return str.trim();
  }
}
