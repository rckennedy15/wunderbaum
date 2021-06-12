/*!
 * Wunderbaum - wunderbaum_node
 * Copyright (c) 2021, Martin Wendt. Released under the MIT license.
 * @VERSION, @DATE (https://github.com/mar10/wunderbaum)
 */

import "./wunderbaum.scss";
import * as util from "./util";
// import { PersistoOptions } from "./wb_options";

// const class_prefix = "wb-";
// const node_props: string[] = ["title", "key", "refKey"];

import { Wunderbaum } from "./wunderbaum";
import {
  ChangeType,
  evalOption,
  iconMap,
  KEY_TO_ACTION_DICT,
  makeNodeTitleMatcher,
  MatcherType,
  NodeAnyCallback,
  NodeStatusType,
  NodeVisitCallback,
  NodeVisitResponse,
  ROW_HEIGHT,
} from "./common";
import { Deferred } from "./deferred";
import { isFunction } from "./util";

export class WunderbaumNode {
  static sequence = 0;

  /** Reference to owning tree. */
  public tree: Wunderbaum;
  /** Parent node (null for the invisible root node `tree.root`). */
  public parent: WunderbaumNode;
  public title: string;
  public readonly key: string;
  public readonly refKey: string | undefined = undefined;
  public children: WunderbaumNode[] | null = null;
  public lazy: boolean = false;
  public expanded: boolean = false;
  public selected: boolean = false;
  public type?: string;
  // --- Node Status ---
  public statusNodeType?: string;
  _isLoading = false;
  _errorInfo: any | null = null;
  // --- FILTER ---
  public match?: boolean; // Added and removed by filter code
  public subMatchCount?: number = 0;
  public subMatchBadge?: HTMLElement;
  public titleWithHighlight?: string;
  public _filterAutoExpanded?: boolean;

  _rowIdx: number | undefined = 0;
  _rowElem: HTMLDivElement | undefined = undefined;

  constructor(tree: Wunderbaum, parent: WunderbaumNode, data: any) {
    util.assert(!parent || parent.tree === tree);
    this.tree = tree;
    this.parent = parent;
    this.key =
      data.key == null ? "" + ++WunderbaumNode.sequence : "" + data.key;
    this.title = data.title || "?" + this.key;
    // this.refKey = data.refKey;
    if (parent) {
      // Don't register root node
      tree._registerNode(this);
    }
  }

  /**
   * Return readable string representation for this instance.
   * @internal
   */
  toString() {
    return "WunderbaumNode@" + this.key + "<'" + this.title + "'>";
  }

  /** Return an option value. */
  protected _getOpt(
    name: string,
    nodeObject: any = null,
    treeOptions: any = null,
    defaultValue: any = null
  ): any {
    return evalOption(
      name,
      this,
      nodeObject || this,
      treeOptions || this.tree.options,
      defaultValue
    );
  }

  /** Call event if defined in options. */
  callEvent(event: string, extra?: any): any {
    return this.tree.callEvent(event, util.extend({ node: this }, extra));
  }

  addChild(node: WunderbaumNode, before?: WunderbaumNode) {
    if (this.children == null) {
      this.children = [node];
    } else if (before) {
      util.assert(false);
    } else {
      this.children.push(node);
    }
    return node;
  }

  /** . */
  addChildren(data: any) {
    util.assert(util.isArray(data));
    for (let i = 0; i < data.length; i++) {
      let d = data[i];
      let node = new WunderbaumNode(this.tree, this, d);

      this.addChild(node);
      if (d.children) {
        node.addChildren(d.children);
      }
    }
    this.tree.setModified(ChangeType.structure, this);
  }

  /** */
  expandAll(flag: boolean = true) {
    this.visit((node) => {
      node.setExpanded(flag);
    });
  }

  /**Find all nodes that match condition (excluding self).
   *
   * @param {string | function(node)} match title string to search for, or a
   *     callback function that returns `true` if a node is matched.
   */
  findAll(match: string | MatcherType): WunderbaumNode[] {
    const matcher = isFunction(match)
      ? <MatcherType>match
      : makeNodeTitleMatcher(<string>match);
    const res: WunderbaumNode[] = [];
    this.visit((n) => {
      if (matcher(n)) {
        res.push(n);
      }
    });
    return res;
  }

  /** Return the direct child with a given key, index or null. */
  findDirectChild(
    ptr: number | string | WunderbaumNode
  ): WunderbaumNode | null {
    let i,
      l,
      cl = this.children;

    if (!cl) return null;
    if (typeof ptr === "string") {
      for (i = 0, l = cl.length; i < l; i++) {
        if (cl[i].key === ptr) {
          return cl[i];
        }
      }
    } else if (typeof ptr === "number") {
      return cl[ptr];
    } else if (ptr.parent === this) {
      // Return null if `ptr` is not a direct child
      return ptr;
    }
    return null;
  }

  /**Find first node that matches condition (excluding self).
   *
   * @param match title string to search for, or a
   *     callback function that returns `true` if a node is matched.
   */
  findFirst(match: string | MatcherType): WunderbaumNode | null {
    const matcher = isFunction(match)
      ? <MatcherType>match
      : makeNodeTitleMatcher(<string>match);
    let res = null;
    this.visit((n) => {
      if (matcher(n)) {
        res = n;
        return false;
      }
    });
    return res;
  }

  /** Find a node relative to self.
   *
   * @param where The keyCode that would normally trigger this move,
   *		or a keyword ('down', 'first', 'last', 'left', 'parent', 'right', 'up').
   */
  findRelatedNode(where: string, includeHidden = false) {
    return this.tree.findRelatedNode(this, where, includeHidden);
  }

  /** Return the first child node or null.
   * @returns {FancytreeNode | null}
   */
  getFirstChild() {
    return this.children ? this.children[0] : null;
  }

  /** Return node depth (starting with 1 for top level nodes). */
  getLevel(): number {
    let i = 0,
      p = this.parent;

    while (p) {
      i++;
      p = p.parent;
    }
    return i;
  }
  /** Return the parent node (null for the system root node).
   * @returns {FancytreeNode | null}
   */
  getParent() {
    // TODO: return null for top-level nodes?
    return this.parent;
  }
  /** Return an array of all parent nodes (top-down).
   * @param includeRoot Include the invisible system root node.
   * @param includeSelf Include the node itself.
   */
  getParentList(includeRoot = false, includeSelf = false) {
    let l = [],
      dtn = includeSelf ? this : this.parent;
    while (dtn) {
      if (includeRoot || dtn.parent) {
        l.unshift(dtn);
      }
      dtn = dtn.parent;
    }
    return l;
  }
  /** Return a string representing the hierachical node path, e.g. "a/b/c".
   * @param includeSelf
   * @param node property name or callback
   * @param separator
   */
  getPath(
    includeSelf = true,
    part: keyof WunderbaumNode | NodeAnyCallback = "title",
    separator = "/"
  ) {
    // includeSelf = includeSelf !== false;
    // part = part || "title";
    // separator = separator || "/";

    let val,
      path: string[] = [],
      isFunc = typeof part === "function";

    this.visitParents((n) => {
      if (n.parent) {
        val = isFunc
          ? (<NodeAnyCallback>part)(n)
          : n[<keyof WunderbaumNode>part];
        path.unshift(val);
      }
      return undefined; // TODO remove this line
    }, includeSelf);
    return path.join(separator);
  }

  /** Return true if node has children. Return undefined if not sure, i.e. the node is lazy and not yet loaded. */
  hasChildren() {
    if (this.lazy) {
      if (this.children == null) {
        // null or undefined: Not yet loaded
        return undefined;
      } else if (this.children.length === 0) {
        // Loaded, but response was empty
        return false;
      } else if (
        this.children.length === 1 &&
        this.children[0].isStatusNode()
      ) {
        // Currently loading or load error
        return undefined;
      }
      return true;
    }
    return !!(this.children && this.children.length);
  }
  isActive() {
    return this.tree.activeNode === this;
  }

  isExpanded() {
    return !!this.expanded;
  }

  isExpandable() {
    return !!this.children;
  }

  isSelected() {
    return !!this.selected;
  }
  /** Return true if this a top level node, i.e. a direct child of the (invisible) system root node.
   */
  isTopLevel() {
    return this.tree.root === this.parent;
  }
  /** Return true if node is lazy and not yet loaded. For non-lazy nodes always return false.
   */
  isUndefined() {
    return this.hasChildren() === undefined; // also checks if the only child is a status node
  }
  /** Return true if all parent nodes are expanded. Note: this does not check
   * whether the node is scrolled into the visible part of the screen.
   */
  isVisible() {
    let i,
      l,
      n,
      hasFilter = this.tree.filterMode === "hide",
      parents = this.getParentList(false, false);

    // TODO: check $(n.span).is(":visible")
    // i.e. return false for nodes (but not parents) that are hidden
    // by a filter
    if (hasFilter && !this.match && !this.subMatchCount) {
      // this.debug( "isVisible: HIDDEN (" + hasFilter + ", " + this.match + ", " + this.match + ")" );
      return false;
    }

    for (i = 0, l = parents.length; i < l; i++) {
      n = parents[i];

      if (!n.expanded) {
        // this.debug("isVisible: HIDDEN (parent collapsed)");
        return false;
      }
      // if (hasFilter && !n.match && !n.subMatchCount) {
      // 	this.debug("isVisible: HIDDEN (" + hasFilter + ", " + this.match + ", " + this.match + ")");
      // 	return false;
      // }
    }
    // this.debug("isVisible: VISIBLE");
    return true;
  }

  /** Return true if this node is a temporarily generated system node like
   * 'loading', 'paging', or 'error' (node.statusNodeType contains the type).
   */
  isStatusNode() {
    return !!this.statusNodeType;
  }

  /** Return true if this node is a temporarily generated system node of type 'paging'. */
  isPagingNode() {
    return this.statusNodeType === "paging";
  }

  /** Download  data from the cloud, then call `.update()`. */
  async load(source: any) {
    let tree = this.tree;
    let opts = tree.options;

    if (opts.debugLevel >= 2) {
      console.time(this + ".load");
    }
    try {
      const response = await fetch(source, { method: "GET" });
      if (!response.ok) {
        util.error(
          "GET " +
            opts.remote +
            " returned " +
            response.status +
            ", " +
            response
        );
      }
      this.callEvent("receive", { response: response });
      const data = await response.json();

      let prev = tree.enableUpdate(false);
      this.addChildren(data);
      tree.enableUpdate(prev);
    } catch (error) {
      this.logError("Error during load()", source, error);
      this.callEvent("error", { error: error });
    }

    if (opts.debugLevel >= 2) {
      console.timeEnd(this + ".load");
    }
  }

  /* Log to console if opts.debugLevel >= 1 */
  log(...args: any[]) {
    if (this.tree.options.debugLevel >= 1) {
      Array.prototype.unshift.call(args, this.toString());
      console.log.apply(console, args);
    }
  }

  /* Log to console if opts.debugLevel >= 4 */
  logDebug(...args: any[]) {
    if (this.tree.options.debugLevel >= 4) {
      Array.prototype.unshift.call(args, this.toString());
      console.log.apply(console, args);
    }
  }

  /* Log warning to console if opts.debugLevel >= 1 */
  logWarning(...args: any[]) {
    if (this.tree.options.debugLevel >= 1) {
      Array.prototype.unshift.call(args, this.toString());
      console.warn.apply(console, args);
    }
  }

  /* Log error to console. */
  logError(...args: any[]) {
    Array.prototype.unshift.call(args, this.toString());
    console.error.apply(console, args);
  }

  /** Expand all parents and optionally scroll into visible area as neccessary.
   * Promise is resolved, when lazy loading and animations are done.
   * @param {object} [opts] passed to `setExpanded()`.
   *     Defaults to {noAnimation: false, noEvents: false, scrollIntoView: true}
   */
  async makeVisible(opts: any) {
    let i,
      dfd = new Deferred(),
      deferreds = [],
      parents = this.getParentList(false, false),
      len = parents.length,
      effects = !(opts && opts.noAnimation === true),
      scroll = !(opts && opts.scrollIntoView === false);

    // Expand bottom-up, so only the top node is animated
    for (i = len - 1; i >= 0; i--) {
      // self.debug("pushexpand" + parents[i]);
      deferreds.push(parents[i].setExpanded(true, opts));
    }
    Promise.all(deferreds).then(() => {
      // All expands have finished
      // self.debug("expand DONE", scroll);
      if (scroll) {
        this.scrollIntoView(effects).then(() => {
          // self.debug("scroll DONE");
          dfd.resolve();
        });
      } else {
        dfd.resolve();
      }
    });
    return dfd.promise();
  }

  /** Set focus relative to this node and optionally activate.
   *
   * 'left' collapses the node if it is expanded, or move to the parent
   * otherwise.
   * 'right' expands the node if it is collapsed, or move to the first
   * child otherwise.
   *
   * @param where 'down', 'first', 'last', 'left', 'parent', 'right', or 'up'.
   *   (Alternatively the `event.key` that would normally trigger this move,
   *   e.g. `ArrowLeft` = 'left'.
   * @param options
   */
  async navigate(where: string, options?: any) {
    // Allow to pass 'ArrowLeft' instead of 'left'
    where = KEY_TO_ACTION_DICT[where] || where;

    // Otherwise activate or focus the related node
    let node = this.findRelatedNode(where);
    if (node) {
      // setFocus/setActive will scroll later (if autoScroll is specified)
      try {
        node.makeVisible({ scrollIntoView: false });
      } catch (e) {} // #272
      if (options.activate === false) {
        node.setFocus();
        return Promise.resolve(this);
      }
      return node.setActive();
    }
    this.logWarning("Could not find related node '" + where + "'.");
    return Promise.resolve(this);
  }

  /** */
  remove() {
    const tree = this.tree;
    this.visit((n) => {
      n.removeMarkup();
      tree._unregisterNode(n);
    });
  }

  removeMarkup() {
    if (this._rowElem) {
      delete (<any>this._rowElem)._wb_node;
      this._rowElem.remove();
      this._rowElem = undefined;
    }
  }

  render(opts: any) {
    const ICON_WIDTH = 20;
    const EXTRA_PAD = 30;

    let tree = this.tree;
    let columns = tree.columns;
    let elem: HTMLElement;
    let nodeElem: HTMLElement;
    let rowDiv = this._rowElem;
    let titleSpan: HTMLElement;
    let checkboxSpan: HTMLElement;
    let iconSpan: HTMLElement;
    let expanderSpan: HTMLElement;
    const activeColIdx = tree.cellNavMode ? tree.activeColIdx : null;

    //
    let rowClasses = ["wb-row"];
    this.expanded ? rowClasses.push("wb-expanded") : 0;
    this.lazy ? rowClasses.push("wb-lazy") : 0;
    this.selected ? rowClasses.push("wb-selected") : 0;
    this === tree.activeNode ? rowClasses.push("wb-active") : 0;

    this.match ? rowClasses.push("wb-match") : 0;
    this.subMatchCount ? rowClasses.push("wb-submatch") : 0;
    // TODO: no need to hide!
    !(this.match || this.subMatchCount) ? rowClasses.push("wb-hide") : 0;

    if (rowDiv) {
      // Row markup already exists
      nodeElem = rowDiv.querySelector("span.wb-node") as HTMLElement;
      titleSpan = nodeElem.querySelector("span.wb-title") as HTMLElement;
      expanderSpan = nodeElem.querySelector("i.wb-expander") as HTMLElement;
      checkboxSpan = nodeElem.querySelector("i.wb-checkbox") as HTMLElement;
      iconSpan = nodeElem.querySelector("i.wb-icon") as HTMLElement;
    } else {
      rowDiv = document.createElement("div");
      // rowDiv.classList.add("wb-row");
      // Attach a node reference to the DOM Element:
      (<any>rowDiv)._wb_node = this;

      nodeElem = document.createElement("span");
      nodeElem.classList.add("wb-node", "wb-col");
      rowDiv.appendChild(nodeElem);

      let ofsTitlePx = 0;

      checkboxSpan = document.createElement("i");
      nodeElem.appendChild(checkboxSpan);
      ofsTitlePx += ICON_WIDTH;

      for (let i = this.getLevel() - 1; i > 0; i--) {
        elem = document.createElement("i");
        elem.classList.add("wb-indent");
        nodeElem.appendChild(elem);
        ofsTitlePx += ICON_WIDTH;
      }

      expanderSpan = document.createElement("i");
      nodeElem.appendChild(expanderSpan);
      ofsTitlePx += ICON_WIDTH;

      iconSpan = document.createElement("i");
      nodeElem.appendChild(iconSpan);
      ofsTitlePx += ICON_WIDTH;

      titleSpan = document.createElement("span");
      titleSpan.classList.add("wb-title");
      nodeElem.appendChild(titleSpan);

      this.callEvent("enhanceTitle", { titleSpan: titleSpan });

      // Store the width of leading icons with the node, so we can calculate
      // the width of the embedded title span later
      (<any>nodeElem)._ofsTitlePx = ofsTitlePx;
      if (tree.options.dnd.dragStart) {
        nodeElem.draggable = true;
      }

      // Render columns
      let colIdx = 0;
      for (let col of columns) {
        colIdx++;

        let colElem;
        if (col.id === "*") {
          colElem = nodeElem;
        } else {
          colElem = document.createElement("span");
          colElem.classList.add("wb-col");
          colElem.textContent = "" + col.id;
          rowDiv.appendChild(colElem);
        }
        if (colIdx === activeColIdx) {
          colElem.classList.add("wb-active");
        }
        colElem.style.left = col._ofsPx + "px";
        colElem.style.width = col._widthPx + "px";
      }
    }

    rowDiv.className = rowClasses.join(" ");
    // rowDiv.style.top = (this._rowIdx! * 1.1) + "em";
    rowDiv.style.top = this._rowIdx! * ROW_HEIGHT + "px";

    if (expanderSpan) {
      if (this.isExpandable()) {
        if (this.expanded) {
          expanderSpan.className = "wb-expander " + iconMap.expanderExpanded;
        } else {
          expanderSpan.className = "wb-expander " + iconMap.expanderCollapsed;
        }
      } else {
        expanderSpan.classList.add("wb-indent");
      }
    }
    if (checkboxSpan) {
      if (this.selected) {
        checkboxSpan.className = "wb-checkbox " + iconMap.checkChecked;
      } else {
        checkboxSpan.className = "wb-checkbox " + iconMap.checkUnchecked;
      }
    }
    if (iconSpan) {
      if (this.expanded) {
        iconSpan.className = "wb-icon " + iconMap.folderOpen;
      } else if (this.children) {
        iconSpan.className = "wb-icon " + iconMap.folder;
      } else {
        iconSpan.className = "wb-icon " + iconMap.doc;
      }
    }
    if (this.titleWithHighlight) {
      titleSpan.innerHTML = this.titleWithHighlight;
    } else if (tree.options.escapeTitles) {
      titleSpan.textContent = this.title;
    } else {
      titleSpan.innerHTML = this.title;
    }
    // Set the width of the title span, so overflow ellipsis work
    titleSpan.style.width =
      columns[0]._widthPx - (<any>nodeElem)._ofsTitlePx - EXTRA_PAD + "px";

    // this.log(
    //   "render",
    //   titleSpan,
    //   columns[0]._widthPx,
    //   (<any>nodeElem)._ofsTitlePx,
    //   titleSpan.offsetLeft,
    //   titleSpan.offsetWidth,
    //   titleSpan.offsetParent
    // );

    // Attach to DOM as late as possible
    if (!this._rowElem) {
      this._rowElem = rowDiv;
      tree.nodeListElement.appendChild(rowDiv);
    }
  }

  async scrollIntoView(options?: any) {
    return this.tree.scrollTo(this);
  }

  async setActive(flag: boolean = true, options?: any) {
    const tree = this.tree;
    let prev = tree.activeNode;
    tree.activeNode = this;
    prev?.setDirty(ChangeType.status);
    this.setDirty(ChangeType.status);
    if (options && options.colIdx != null && tree.cellNavMode) {
      tree.setColumn(options.colIdx);
    }
    // requestAnimationFrame(() => {
    //   this.scrollIntoView();
    // })
    this.scrollIntoView();
  }

  setDirty(type: ChangeType) {
    if (this.tree._enableUpdate === false) {
      return;
    }
    if (type === ChangeType.structure) {
      this.tree.updateViewport();
    } else if (this._rowElem) {
      // otherwise not in viewport, so no need to render
      this.render({});
    }
  }

  async setExpanded(flag: boolean = true, options?: any) {
    this.expanded = flag;
    this.setDirty(ChangeType.structure);
  }

  setFocus(flag: boolean = true, options?: any) {
    let prev = this.tree.focusNode;
    this.tree.focusNode = this;
    prev?.setDirty(ChangeType.status);
    this.setDirty(ChangeType.status);
  }

  setSelected(flag: boolean = true, options?: any) {
    this.selected = flag;
    this.setDirty(ChangeType.status);
  }

  /** Show node status (ok, loading, error, nodata) using styles and a dummy child node.
   */
  setStatus(
    status: NodeStatusType,
    message?: string,
    details?: string
  ): WunderbaumNode | null {
    let tree = this.tree;
    let statusNode: WunderbaumNode | null = null;

    const _clearStatusNode = () => {
      // Remove dedicated dummy node, if any
      let children = this.children;

      if (children && children.length && children[0].isStatusNode()) {
        children[0].remove();
      }
    };

    const _setStatusNode = (data: any, type: NodeStatusType) => {
      // Create/modify the dedicated dummy node for 'loading...' or
      // 'error!' status. (only called for direct child of the invisible
      // system root)
      let children = this.children;
      let firstChild = children ? children[0] : null;

      if (firstChild && firstChild.isStatusNode()) {
        statusNode = firstChild;
        util.extend(firstChild, data);
        firstChild.statusNodeType = type;
        // tree._callHook("nodeRenderTitle", firstChild);
        tree.setModified(ChangeType.row, statusNode);
      } else {
        this.addChildren([data]);
        statusNode = this.children![0];
        // tree._callHook("treeStructureChanged", ctx, "setStatusNode");
        statusNode.statusNodeType = type;
        tree.setModified(ChangeType.structure);
        // tree.render();
      }
      return statusNode;
    };

    switch (status) {
      case "ok":
        _clearStatusNode();
        this._isLoading = false;
        this._errorInfo = null;
        break;
      case "loading":
        if (!this.parent) {
          _setStatusNode(
            {
              title:
                tree.options.strings.loading +
                (message ? " (" + message + ")" : ""),
              // icon: true,  // needed for 'loding' icon
              checkbox: false,
              tooltip: details,
            },
            status
          );
        }
        this._isLoading = true;
        this._errorInfo = null;
        break;
      case "error":
        _setStatusNode(
          {
            title:
              tree.options.strings.loadError +
              (message ? " (" + message + ")" : ""),
            // icon: false,
            checkbox: false,
            tooltip: details,
          },
          status
        );
        this._isLoading = false;
        this._errorInfo = { message: message, details: details };
        break;
      case "nodata":
        _setStatusNode(
          {
            title: message || tree.options.strings.noData,
            // icon: false,
            checkbox: false,
            tooltip: details,
          },
          status
        );
        this._isLoading = false;
        this._errorInfo = null;
        break;
      default:
        util.error("invalid node status " + status);
    }
    return statusNode;
  }
  /** Call fn(node) for all child nodes in hierarchical order (depth-first).<br>
   * Stop iteration, if fn() returns false. Skip current branch, if fn() returns "skip".<br>
   * Return false if iteration was stopped.
   *
   * @param {function} callback the callback function.
   *     Return false to stop iteration, return "skip" to skip this node and
   *     its children only.
   */
  visit(
    callback: NodeVisitCallback,
    includeSelf: boolean = false
  ): NodeVisitResponse {
    let i,
      l,
      res: any = true,
      children = this.children;

    if (includeSelf === true) {
      res = callback(this);
      if (res === false || res === "skip") {
        return res;
      }
    }
    if (children) {
      for (i = 0, l = children.length; i < l; i++) {
        res = children[i].visit(callback, true);
        if (res === false) {
          break;
        }
      }
    }
    return res;
  }

  /** Call fn(node) for all parent nodes, bottom-up, including invisible system root.<br>
   * Stop iteration, if callback() returns false.<br>
   * Return false if iteration was stopped.
   *
   * @param callback the callback function. Return false to stop iteration
   */
  visitParents(
    callback: (node: WunderbaumNode) => boolean | void,
    includeSelf: boolean = false
  ): boolean {
    if (includeSelf && callback(this) === false) {
      return false;
    }
    let p = this.parent;
    while (p) {
      if (callback(p) === false) {
        return false;
      }
      p = p.parent;
    }
    return true;
  }

  /** Call fn(node) for all sibling nodes.<br>
   * Stop iteration, if fn() returns false.<br>
   * Return false if iteration was stopped.
   *
   * @param {function} fn the callback function.
   *     Return false to stop iteration.
   */
  visitSiblings(
    callback: (node: WunderbaumNode) => boolean | void,
    includeSelf: boolean = false
  ): boolean {
    let i,
      l,
      n,
      ac = this.parent.children!;

    for (i = 0, l = ac.length; i < l; i++) {
      n = ac[i];
      if (includeSelf || n !== this) {
        if (callback(n) === false) {
          return false;
        }
      }
    }
    return true;
  }
  /**
   * [ext-filter] Return true if this node is matched by current filter (or no filter is active).
   */
  isMatched() {
    return !(this.tree.filterMode && !this.match);
  }
}
