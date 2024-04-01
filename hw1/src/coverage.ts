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
  , ExpressionStatement
  , UnaryExpression
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
        const countFunc = createStmt(`__cov__.func.add(${fid});`)

        if (body.type === 'BlockStatement') {
          const blockStmt = body as BlockStatement;
          const stmts = blockStmt.body;
          blockStmt.body = walkStmts(stmts);
          blockStmt.body.unshift(countFunc);
        } else { // Expression. 
          const sid = scount++;
          stmtTarget[sid] = Range.fromNode(code, body);
          const countFunc = createExpr(`__cov__.func.add(${fid});`)
          const countStmt = createExpr(`__cov__.stmt.add(${sid});`)
          walk.recursive(body, null, visitor)
          // const newExpr = createReturnStmt(body)
          // const newBlock = toBlockStmt(newExpr)
          // newBlock.body.unshift(countStmt)
          // newBlock.body.unshift(countFunc)
          // func.body = newBlock 
          const newExpr = createSeqExpr([countFunc, countStmt, body])
          func.body = newExpr
        }
        // console.log(func.body)
      },
      VariableDeclaration(decl) { // stmt 
        const { type, declarations, kind } = decl;
        for (const curDecl of declarations) { 
          
          // main
          const { type:t2, id, init } = curDecl;
          walk.recursive(id, null, visitor)
          
          if (init) {
            const sid = scount++;
            stmtTarget[sid] = Range.fromNode(code, curDecl);
            const countExpr = createExpr(`__cov__.stmt.add(${sid});`)
            walk.recursive(init, null, visitor)
            const newDecl = createSeqExpr([countExpr, init])
            curDecl.init = newDecl
          } else {
            // const newDecl = countExpr
            // curDecl.init = newDecl
          }
        }
      },
      AssignmentPattern(pattern) { // stmt
        const { type, left, right } = pattern;
        walk.recursive(left, null, visitor)
        const sid = scount++;
        stmtTarget[sid] = Range.fromNode(code, right);
        const countStmt = createExpr(`__cov__.stmt.add(${sid});`)
        walk.recursive(right, null, visitor)
        const newExpr = createSeqExpr([countStmt, right])
        pattern.right = newExpr 
      },
      BlockStatement(node) {
        node.body = walkStmts(node.body);
      },
      SwitchStatement(stmt) { // branch 
        const { type, discriminant, cases } = stmt;

        walk.recursive(discriminant, null, visitor)
        
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
        const bid1 = bcount++;
        branchTarget[bid1] = Range.fromNode(code, consequent);

        // if case.
        const blockConsequent = toBlockStmt(consequent)
        stmt.consequent = blockConsequent
        walk.recursive(blockConsequent, null, visitor) 
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
        walk.recursive(test, null, visitor)
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
        } else if (left.type == 'UnaryExpression' && left.operator == '!') {
          const bid1 = bcount++;
          branchTarget[bid1] = Range.fromNode(code, left);
          const countExpr1 = createExpr(`__cov__.branch.add(${bid1});`)

          walk.recursive(left.argument, null, visitor);

          const newLeft = createSeqExpr([countExpr1, left])
          node.left = newLeft
        } else {
          const bid1 = bcount++;
          branchTarget[bid1] = Range.fromNode(code, left);
          const countExpr1 = createExpr(`__cov__.branch.add(${bid1});`)
          const newLeft = createSeqExpr([countExpr1, left])
          node.left = newLeft
        }

        if (right.type == 'LogicalExpression') {
          walk.recursive(right, null, visitor);
        } else if (right.type == 'UnaryExpression' && right.operator == '!') {
          const bid2 = bcount++;
          branchTarget[bid2] = Range.fromNode(code, right);
          const countExpr2 = createExpr(`__cov__.branch.add(${bid2});`)

          walk.recursive(right.argument, null, visitor);

          const newRight = createSeqExpr([countExpr2, right])
          node.right = newRight
        } else {
          const bid2 = bcount++;
          branchTarget[bid2] = Range.fromNode(code, right);
          walk.recursive(right, null, visitor);
          const countExpr2 = createExpr(`__cov__.branch.add(${bid2});`)
          const newRight = createSeqExpr([countExpr2, right])
          node.right = newRight
        }
      }, 
      LabeledStatement(node) { 
        const { label, body } = node; 
        const sid = scount++ 
        const countStmt = createStmt(`__cov__.stmt.add(${sid});`);
        stmtTarget[sid] = Range.fromNode(code, body);
        walk.recursive(body, null, visitor);
        const newBody = prependStmt(countStmt, body);
        node.body = newBody; 
      },
      WhileStatement(node) { 
        const { test, body } = node;
        walk.recursive(test, null, visitor)
        
        const newBody = toBlockStmt(body)
        node.body = newBody
        walk.recursive(newBody, null, visitor)

        // const sid = scount++ 
        // stmtTarget[sid] = Range.fromNode(code, body)
        // const countStmt = createStmt(`__cov__.stmt.add(${sid});`);
        // const newStmt = toBlockStmt(body)
        // newStmt.body.unshift(countStmt)
        // node.body =newStmt
      },
      DoWhileStatement(node) { 
        const { body, test } = node;

        const newBody = toBlockStmt(body)
        node.body = newBody
        walk.recursive(newBody, null, visitor)
        walk.recursive(test, null, visitor)

        // const sid = scount++ 
        // stmtTarget[sid] = Range.fromNode(code, body)
        // const countStmt = createStmt(`__cov__.stmt.add(${sid});`);
        // const newStmt = toBlockStmt(body)
        // newStmt.body.unshift(countStmt)
        // node.body =newStmt
      },
      ForStatement(node) { 
        const { type, init, test, update, body } = node;
        const newBody = toBlockStmt(body)
        node.body = newBody

        if (init) {
          walk.recursive(init, null, visitor)
        }
        if (test) {
          walk.recursive(test, null, visitor)
        }
        if (update) {
          walk.recursive(update, null, visitor)
        }
        walk.recursive(newBody, null, visitor)

        // const sid = scount++ 
        // stmtTarget[sid] = Range.fromNode(code, body)
        // const countStmt = createStmt(`__cov__.stmt.add(${sid});`);
        // const newStmt = toBlockStmt(body)
        // newStmt.body.unshift(countStmt)
        // node.body =newStmt
      },
      ForInStatement(node) { 
        const { type, left, right, body } = node;
        const newBody = toBlockStmt(body)
        node.body = newBody

        // walk.recursive(left, null, visitor)
        // walk.recursive(right, null, visitor)
        walk.recursive(newBody, null, visitor)

        // const sid = scount++ 
        // stmtTarget[sid] = Range.fromNode(code, body)
        // const countStmt = createStmt(`__cov__.stmt.add(${sid});`);
        // const newStmt = toBlockStmt(body)
        // newStmt.body.unshift(countStmt)
        // node.body =newStmt
      },
      ForOfStatement(node) { 
        const { type, left, right, body, await } = node;
        const newBody = toBlockStmt(body)
        node.body = newBody

        // walk.recursive(left, null, visitor)
        // walk.recursive(right, null, visitor)
        walk.recursive(newBody, null, visitor)

        // const sid = scount++ 
        // stmtTarget[sid] = Range.fromNode(code, body)
        // const countStmt = createStmt(`__cov__.stmt.add(${sid});`);
        // const newStmt = toBlockStmt(body)
        // newStmt.body.unshift(countStmt)
        // node.body =newStmt
      },
    }

    // Instrument the sequence of statements
    function walkStmts(stmts: Statement[]): Statement[] {
      let newStmts = [];
      for (const stmt of stmts) {
        // console.log(stmt)
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


// function fromNodeToLast(code: string, node: Node): Range {
//   return Range.fromCode(code, node.end, node.end);
// }