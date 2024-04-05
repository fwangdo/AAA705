import {
  log,
  header,
  warn,
  todo,
  parse,
  Range,
  createBoolLiteral,
  createTemplateElement,
} from './helper';

import {
  Mutant,
  MutantType,
} from './tester';

import { green } from 'chalk';

import acorn, { ExpressionStatement, MemberExpression } from 'acorn';
import {
  AssignmentOperator,
  BinaryExpression,
  BinaryOperator,
  BlockStatement,
  ConditionalExpression,
  Expression,
  IfStatement,
  LogicalExpression,
  LogicalOperator,
  Node,
  Literal,  
  Super,
} from 'acorn';

import walk from 'acorn-walk';

import { generate } from 'astring';
import { isInt8Array } from 'util/types';
import exp from 'constants';
import { boolean } from 'yargs';
import { CallExpression } from 'estree';

/*
  helper function 
 */
export function checkIsFalse(node: Expression): boolean {
  if (node.type !== "Literal") return false 
  const { value } = node; 
  if (value === false) return true 
  return false
} 


export function checkIsTrue(node: Expression): boolean {
  if (node.type !== "Literal") return false 
  const { value } = node; 
  if (value === true) return true 
  return false
} 


// change value for literal 
export function putFalse(node: Expression): Literal {
  // if (node.type !== "Literal") throw new Error; 
  // return {type: 'Literal', value: false, start: node.start, end: node.end }
  return createBoolLiteral(false) 
}


export function putTrue(node: Expression): Expression {
  // return {type: 'Literal', value: true, start: node.start, end: node.end }
  return createBoolLiteral(true) 
  // if (node.type !== "Literal") throw new Error; 
  // node.value = true  
  // return node 
}


export function checkOption(node: Expression): boolean {
  if (node.type === 'CallExpression') {
    if (node.optional === true) return true 
    const { callee } = node;
    if (callee.type !== 'Super') {
      if (checkIsTarget(callee)) {
        return checkOption(callee)
      }
    }
  } else if (node.type == 'MemberExpression') {
    if (node.optional === true) return true 
    const { object } = node;
    if (object.type !== 'Super') {
      if (checkIsTarget(object)) {
        return checkOption(object)
      }
    }
  }
  return false  
}


export function checkIsCall(node: Expression): boolean {
  if (node.type == 'CallExpression') return true;
  return false;
}

export function checkIsMember(node: Expression): boolean {
  if (node.type == 'MemberExpression') return true;
  return false;
}


export function checkIsTarget(node: Expression): boolean {
  if (checkIsCall(node)) return true;
  if (checkIsMember(node)) return true;
  return false;
}


export function eliminateOption(node: CallExpression | MemberExpression): CallExpression | MemberExpression {
  if (node.type === 'CallExpression') {
    node.optional = false;
    const { callee } = node;
    if (callee.type === 'MemberExpression' || callee.type == 'CallExpression') {
      node.callee = eliminateOption(callee);
    }
  } else if (node.type == 'MemberExpression') {
    node.optional = false;
    const { object } = node;
    if (object.type !== 'Super') {
      if (checkIsTarget(object)) {
        node.object = eliminateOption(object);
      }
    }
  }
  return node 
}


/* Mutator
 *
 * (Problem #1) Mutation Operation (70 points)
 *
 * Please implement the missing parts (denoted by todo() functions).
 *
 * The goal of this project to generate mutants from a given JavaScript code
 * and to measure the mutation score of a test suite as its adequacy criterion.
 */
export class Mutator {
  code: string;
  mutants: Mutant[];
  ast: Node;
  beautified: string;
  detail: boolean;

  // Generate mutants from the code
  static from(code: string, detail: boolean = false): Mutant[] {
    const mutator = new Mutator(code, detail);
    return mutator.mutants;
  }

  // Constructor
  constructor(code: string, detail: boolean = false) {
    this.code = code;
    this.mutants = [];
    this.ast = parse(this.code);
    this.beautified = generate(this.ast);
    this.detail = detail;
    this.generateMutants();
  }

  // Generate mutants
  generateMutants = (): void => {
    const { ast, beautified: before, visitor, detail } = this;
    if (detail) header('Generating Mutants...');
    walk.recursive(ast, null, visitor);
    const after = generate(ast);
    if (before !== after) {
      warn('The AST is changed after generating mutants');
    }
  }

  // Add a mutant to the list with its type and the target node
  addMutant = (type: MutantType, node: Node): void => {
    const { mutants, code, ast, beautified, detail } = this;
    const id = mutants.length + 1;
    const mutated = generate(ast);
    const range = Range.fromNode(code, node);
    const after = generate(node);
    const mutant = new Mutant(id, type, mutated, code, range, after);
    mutants.push(mutant);
    if (beautified == mutated) {
      warn('The code is the same after generating a mutant');
      warn(mutant);
    } else if (detail) {
      log(mutant, green);
    }
  }

  // Visitor for generating mutants
  visitor: walk.RecursiveVisitors<any> = {
    ArrayExpression: (node) => { // TODO  
      const { visitor, addMutant } = this;
      const { elements } = node; 
      if (elements.length > 0) {
        node.elements = []
        addMutant(MutantType.ArrayDecl, node);
        node.elements = elements
      }
      for (const elem of elements) {
        if (elem !== null) {
        //  console.log(elem)
         walk.recursive(elem, null, visitor)
        }
      }
    },
    AssignmentExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { operator, left, right } = node; 
      switch (operator) {
        case '+=':
          node.operator = '-=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '-=':
          node.operator = '+=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '*=':
          node.operator = '/=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '/=':
          node.operator = '*=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '%=':
          node.operator = '*=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '<<=':
          node.operator = '>>=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '>>=':
          node.operator = '<<=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '&=':
          node.operator = '|=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '|=':
          node.operator = '&=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
        case '??=':
          node.operator = '&&=';
          addMutant(MutantType.AssignExpr, node);
          node.operator = operator;
          break;
      }
      walk.recursive(left, null, visitor);
      walk.recursive(right, null, visitor);
    }, 
    BinaryExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { operator, left, right } = node; 
      switch (operator) {
        case '+':
          node.operator = '-';
          addMutant(MutantType.Arithmetic, node);
          node.operator = operator;
          break;
        case '-':
          node.operator = '+';
          addMutant(MutantType.Arithmetic, node);
          node.operator = operator;
          break;
        case '*':
          node.operator = '/';
          addMutant(MutantType.Arithmetic, node);
          node.operator = '%';
          addMutant(MutantType.Arithmetic, node);
          node.operator = operator;
          break;
        case '/':
          node.operator = '*';
          addMutant(MutantType.Arithmetic, node);
          node.operator = '%';
          addMutant(MutantType.Arithmetic, node);
          node.operator = operator;
          break;
        case '%':
          node.operator = '*';
          addMutant(MutantType.Arithmetic, node);
          node.operator = '/';
          addMutant(MutantType.Arithmetic, node);
          node.operator = operator;
          break;
        // comp functions 
        case '<':
          node.operator = '<=';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '>=';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
        case '<=':
          node.operator = '<';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '>';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
        case '>':
          node.operator = '>=';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '<=';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
        case '>=':
          node.operator = '>';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '<';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
        case '==':
          node.operator = '!=';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '===';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
        case '!=':
          node.operator = '==';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '!==';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
        case '===':
          node.operator = '!==';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '==';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
        case '!==':
          node.operator = '===';
          addMutant(MutantType.EqualityOp, node);
          node.operator = '!=';
          addMutant(MutantType.EqualityOp, node);
          node.operator = operator;
          break;
      }
      walk.recursive(left, null, visitor);
      walk.recursive(right, null, visitor);
    },
    BlockStatement: (node) => { 
      // console.log(node)
      const { visitor, addMutant } = this;
      const { body } = node
      if (body.length > 0) {
        node.body = [];
        addMutant(MutantType.BlockStmt, node);
        node.body = body
      }
      
      for (const elem of body) { 
        if (elem.type === 'VariableDeclaration') console.log(elem.declarations)
        walk.recursive(elem, null, visitor) 
      }
    },
    ChainExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { expression } = node;
      if (checkOption(expression)) {
        node.expression = eliminateOption(expression)
      }
      walk.recursive(expression, null, visitor)
    },
    ConditionalExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { test, alternate, consequent } = node;
      if (!checkIsFalse(test)) {
        node.test = putFalse(test)
        addMutant(MutantType.Cond, node);
        node.test = test 
      }
      if (!checkIsTrue(test)) {
        node.test = putTrue(test)
        addMutant(MutantType.Cond, node);
        node.test = test 
      }
      walk.recursive(test, null, visitor)
      walk.recursive(alternate, null, visitor)
      walk.recursive(consequent, null, visitor)
    },
    DoWhileStatement: (node) => { 
      const { visitor, addMutant } = this;
      const { body, test } = node; 
      if (!checkIsFalse(test)) {
        node.test = putFalse(test)
        addMutant(MutantType.Cond, node);
        node.test = test 
      }
      walk.recursive(body, null, visitor)
    },
    ForStatement: (node) => { 
      const { visitor, addMutant } = this;
      const { test, body } = node;
      if (test) {
        if (!checkIsFalse(test)) {
          node.test = putFalse(test)
          addMutant(MutantType.Cond, node);
          node.test = test 
        }
      } 
      walk.recursive(body, null, visitor)
    },
    IfStatement: (node) => { 
      const { visitor, addMutant } = this;
      const { test, consequent, alternate } = node;
      // console.log(test) 
      if (!checkIsTrue(test)) {
        node.test = putTrue(test)
        addMutant(MutantType.Cond, node);
        node.test = test 
      }
      if (!checkIsFalse(test)) {
        node.test = putFalse(test)
        addMutant(MutantType.Cond, node);
        node.test = test 
      } 
      walk.recursive(test, null, visitor)
      walk.recursive(consequent, null, visitor); 
      if (alternate) walk.recursive(alternate, null, visitor);
    },
    Literal: (node) => { 
      const { visitor, addMutant } = this;
      const { value, raw } = node;
      if (typeof value === 'boolean') {
        node.value = !value
        node.raw = String(node.value)
        addMutant(MutantType.BooleanLiteral, node);
        node.value = value;
        node.raw = String(node.value)
      } else if (typeof value === 'string') {
        if (value == '') {
          node.value = "__PLRG__";
          node.raw = "__PLRG__";
          addMutant(MutantType.StringLiteral, node);
          node.value = value;
          node.raw = raw;
        } else {
          node.value = '';
          node.raw = '""';
          addMutant(MutantType.StringLiteral, node);
          node.value = value;
          node.raw = raw;
        }
      }
    },
    LogicalExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { operator, left, right } = node; 
      switch (operator) {
        case '&&':
          node.operator = '||';
          addMutant(MutantType.LogicalOp, node);
          node.operator = '??';
          addMutant(MutantType.LogicalOp, node);
          node.operator = operator;
          break;
        case '||':
          node.operator = '&&';
          addMutant(MutantType.LogicalOp, node);
          node.operator = '??';
          addMutant(MutantType.LogicalOp, node);
          node.operator = operator;
          break;
        case '??':
          node.operator = '&&';
          addMutant(MutantType.LogicalOp, node);
          node.operator = '||';
          addMutant(MutantType.LogicalOp, node);
          node.operator = operator;
          break;
      }
      walk.recursive(left, null, visitor);
      walk.recursive(right, null, visitor);
    },
    NewExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { callee } = node;

      if (node.arguments.length > 0) { 
        const temp = node.arguments
        node.arguments = []
        addMutant(MutantType.ArrayDecl, node);
        node.arguments = temp 
      }

      for (const arg of node.arguments) {
       walk.recursive(arg, null, visitor) 
      }
      walk.recursive(callee, null, visitor);
    },
    ObjectExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { properties } = node; 
      node.properties = [];
      addMutant(MutantType.ObjectLiteral, node);
      node.properties = properties; 
    
      for (const prop of properties) {
        walk.recursive(prop, null, visitor);
      }
    },
    TemplateLiteral: (node) => { 
      const { visitor, addMutant } = this;
      const { quasis, expressions } = node;

      for (const quasi of quasis) {
        console.log(quasi)
      }
      for (const expr of expressions) {
        walk.recursive(expr, null, visitor)
      }
    },
    UnaryExpression: (node) => {
      const { visitor, addMutant } = this;
      const { argument, operator } = node;
      switch (operator) {
        case '+':
          node.operator = '-';
          addMutant(MutantType.UnaryOp, node);
          node.operator = operator;
          break;
        case '-':
          node.operator = '+';
          addMutant(MutantType.UnaryOp, node);
          node.operator = operator;
          break;
      }
      walk.recursive(argument, null, visitor);
    },
    UpdateExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { operator, argument, prefix } = node; 

      switch (operator) {
        case '++':
          node.prefix = !prefix
          addMutant(MutantType.Update, node);
          node.prefix = prefix
          node.operator = '--';
          addMutant(MutantType.Update, node);
          node.operator = operator;
          break;
        case '--':
          node.prefix = !prefix
          addMutant(MutantType.Update, node);
          node.prefix = prefix
          node.operator = '++';
          addMutant(MutantType.Update, node);
          node.operator = operator;
          break;
      }
      walk.recursive(argument, null, visitor);
    },
    WhileStatement: (node) => { 
      const { visitor, addMutant } = this;
      const { test, body } = node; 
      if (!checkIsFalse(test)) {
        node.test = putFalse(test)
        addMutant(MutantType.Cond, node);
        node.test = test 
      }
      walk.recursive(body, null, visitor)
    },
    // XXX: for assertion
    // DO not modify the code inside the function
    CallExpression: (node) => {
      const { visitor, addMutant } = this;
      const { callee, arguments: args } = node;
      // Not to mutate the assertion function
      if (callee.type === 'Identifier' && callee.name === '__assert__') {
        return;
      }
      // Recursively mutate the arguments if it is not the assertion function
      for (const arg of args) walk.recursive(arg, null, visitor);
    },
    // added
    // ExpressionStatement: (node) => {
    //   const { visitor, addMutant } = this;
    //   const { expression } = node;
    //   walk.recursive(expression, null, visitor)
    // },
    // FunctionDeclaration: (node) => {
    //   const { visitor, addMutant } = this;
    //   const { body } = node;
    //   walk.recursive(body, null, visitor)
    // }
  }
}

/* Inputs for mutation testing of `example/vector.js`
 *
 * (Problem #2) Killing All Mutants (30 points)
 *
 * Please construct inputs generating a test suite for the `example/vector.js`
 * JavaScript file that kills all the generated mutants.
 *
 * The current inputs kills only 7 out of 220 mutants.
 */
export const vectorInputs: [string][] = [
  ["$V([])"],
  ["$V([1, 2, 3]).dup()"],
]
