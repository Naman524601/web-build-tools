// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import yaml = require('js-yaml');

import { DocItemSet } from '../utils/DocItemSet';
import { IYamlTocItem } from './IYamlTocFile';
import { IYamlItem } from './IYamlApiFile';
import { YamlDocumenter } from './YamlDocumenter';
import { Text, FileSystem } from '@microsoft/node-core-library';

interface ISnippetsFile {
  /**
   * The keys are API names like "Excel.Range.clear".
   * The values are TypeScript source code excerpts.
   */
  [apiName: string]: string[];
}

/**
 * Extends YamlDocumenter with some custom logic that is specific to Office Add-ins.
 */
export class OfficeYamlDocumenter extends YamlDocumenter {
  private _snippets: ISnippetsFile;

  // Default API Set URL when no product match is found.
  private _apiSetUrlDefault: string = '/office/dev/add-ins/reference/javascript-api-for-office';

  // Hash set of API Set URLs based on product.
  private _apiSetUrls: Object = {
    'Excel': '/office/dev/add-ins/reference/requirement-sets/excel-api-requirement-sets',
    'OneNote': '/office/dev/add-ins/reference/requirement-sets/onenote-api-requirement-sets',
    'Visio': '/office/dev/add-ins/reference/overview/visio-javascript-reference-overview',
    'Outlook': '/office/dev/add-ins/reference/requirement-sets/outlook-api-requirement-sets',
    'Word': '/office/dev/add-ins/reference/requirement-sets/word-api-requirement-sets'
  };

  public constructor(docItemSet: DocItemSet, inputFolder: string) {
    super(docItemSet);

    const snippetsFilePath: string = path.join(inputFolder, 'snippets.yaml');

    console.log('Loading snippets from ' + snippetsFilePath);

    const snippetsContent: string = FileSystem.readFile(snippetsFilePath);
    this._snippets = yaml.load(snippetsContent, { filename: snippetsFilePath });
  }

  public generateFiles(outputFolder: string): void { // override
    super.generateFiles(outputFolder);

    // After we generate everything, check for any unused snippets
    console.log();
    for (const apiName of Object.keys(this._snippets)) {
      console.error(colors.yellow('Warning: Unused snippet ' + apiName));
    }
  }

  protected onGetTocRoot(): IYamlTocItem { // override
    return {
      name: 'API reference',
      href: '~/docs-ref-autogen/overview/office.md',
      items: [ ]
    };
  }

  protected onCustomizeYamlItem(yamlItem: IYamlItem): void { // override
    const nameWithoutPackage: string = yamlItem.uid.replace(/^[^.]+\./, '');
    if (yamlItem.summary) {
      yamlItem.summary = this._fixupApiSet(yamlItem.summary, yamlItem.uid);
      yamlItem.summary = this._fixBoldAndItalics(yamlItem.summary);
      yamlItem.summary = this._fixCodeTicks(yamlItem.summary);
    }
    if (yamlItem.remarks) {
      yamlItem.remarks = this._fixupApiSet(yamlItem.remarks, yamlItem.uid);
      yamlItem.remarks = this._fixBoldAndItalics(yamlItem.remarks);
      yamlItem.remarks = this._fixCodeTicks(yamlItem.remarks);
      yamlItem.remarks = this._fixEscapedCode(yamlItem.remarks);
    }
    if (yamlItem.syntax && yamlItem.syntax.parameters) {
      yamlItem.syntax.parameters.forEach(part => {
          if (part.description) {
            part.description = this._fixCodeTicks(part.description);
            part.description = this._fixBoldAndItalics(part.description);
          }
      });
    }

    const snippets: string[] | undefined = this._snippets[nameWithoutPackage];
    if (snippets) {
      delete this._snippets[nameWithoutPackage];
      const snippetText: string = this._generateExampleSnippetText(snippets);
      if (yamlItem.remarks) {
        yamlItem.remarks += snippetText;
      } else if (yamlItem.syntax && yamlItem.syntax.return) {
        if (!yamlItem.syntax.return.description) {
          yamlItem.syntax.return.description = '';
        }
        yamlItem.syntax.return.description += snippetText;
      } else {
        yamlItem.remarks = snippetText;
      }
    }
  }

  private _fixupApiSet(markup: string, uid: string): string {
    // Search for a pattern such as this:
    // \[Api set: ExcelApi 1.1\]
    //
    // Hyperlink it like this:
    // \[ [API set: ExcelApi 1.1](http://bing.com?type=excel) \]
    markup = markup.replace(/Api/, 'API');
    return markup.replace(/\\\[(API set:[^\]]+)\\\]/, '\\[ [$1](' + this._getApiSetUrl(uid) + ') \\]');
  }

  // Gets the link to the API set based on product context. Seeks a case-insensitve match in the hash set.
  private _getApiSetUrl(uid: string): string {
    for (const key of Object.keys(this._apiSetUrls)) {
      const regexp: RegExp = new RegExp(key, 'i');
      if (regexp.test(uid)) {
          return this._apiSetUrls[key];
      }
    }
    return this._apiSetUrlDefault; // match not found.
  }

  private _fixBoldAndItalics(text: string): string {
    return Text.replaceAll(text, '\\*', '*');
  }

  private _fixCodeTicks(text: string): string {
    return Text.replaceAll(text, '\\`', '`');
  }

  private _fixEscapedCode(text: string): string {
    const backtickIndex: number = text.indexOf('`');
    if (text.indexOf('`', backtickIndex) > 0) {
      text = Text.replaceAll(text, '=&gt;', '=>');
      let x: number = text.indexOf('\\', backtickIndex);
      while (x >= 0) {
        text = text.replace(/\\([^\\])/, '$1');
        x = text.indexOf('\\', x + 1);
      }
    }
    return text;
  }

  private _generateExampleSnippetText(snippets: string[]): string {
    const text: string[] = ['\n#### Examples\n'];
    for (const snippet of snippets) {
      if (snippet.search(/await/) === -1) {
        text.push('```javascript');

      } else {
        text.push('```typescript');
      }

      text.push(snippet);
      text.push('```');
    }
    return text.join('\n');
  }
}