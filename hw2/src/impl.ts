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

import acorn from 'acorn';
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
} from 'acorn';

import walk from 'acorn-walk';

import { generate } from 'astring';
import { isInt8Array } from 'util/types';
import exp from 'constants';
import { boolean } from 'yargs';

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
      if (elements[0] !== null) {
        node.elements[0] = null;
        addMutant(MutantType.Arithmetic, node);
        node.elements = elements
      }
      for (const elem of elements) {
        if (elem !== null) walk.recursive(elem, null, visitor)
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
      }
      walk.recursive(left, null, visitor);
      walk.recursive(right, null, visitor);
    },
    BlockStatement: (node) => { 
      const { visitor, addMutant } = this;
      const { body } = node
      if (body.length !== 0) {
        node.body = [];
        addMutant(MutantType.BlockStmt, node);
        node.body = body
      }
      for (const elem of body) { walk.recursive(elem, null, visitor) }
    },
    ChainExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { expression } = node;
      walk.recursive(expression, null, visitor)
    },
    ConditionalExpression: (node) => { 
      const { visitor, addMutant } = this;
      const { test, alternate, consequent } = node;
      walk.recursive(test, null, visitor) // Changing should be ensured!
      walk.recursive(alternate, null, visitor)
      walk.recursive(consequent, null, visitor)
    },
    DoWhileStatement: (node) => { 
      const { visitor, addMutant } = this;
      todo() 
    },
    ForStatement: (node) => { 
      const { visitor, addMutant } = this;
      todo() 
    },
    IfStatement: (node) => { 
      const { visitor, addMutant } = this;
      todo() 
    },
    Literal: (node) => { 
      const { visitor, addMutant } = this;
      const { value } = node;
      if (typeof value === 'boolean') {
        if (value === true) {
          node.value = false;
          addMutant(MutantType.BooleanLiteral, node);
          node.value = value;
        } else {
          node.value = true;
          addMutant(MutantType.BooleanLiteral, node);
          node.value = value;
        } 
      }
      // add string case
    },
    LogicalExpression: (node) => { 
      const { visitor, addMutant } = this;
      todo() 
    },
    NewExpression: (node) => { 
      const { visitor, addMutant } = this;
      todo() 
    },
    ObjectExpression: (node) => { 
      const { visitor, addMutant } = this;
      todo() 
    },
    TemplateLiteral: (node) => { 
      const { visitor, addMutant } = this;
      todo() 
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
    UpdateExpression: (node) => { todo() },
    WhileStatement: (node) => { todo() },
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
    }
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
