/*!
 * Wunderbaum - ext-dnd
 * Copyright (c) 2021, Martin Wendt. Released under the MIT license.
 * @VERSION, @DATE (https://github.com/mar10/wunderbaum)
 */
import * as util from "./util";
import { EventCallbackType, onEvent } from "./util";
import { Wunderbaum } from "./wunderbaum";
import { WunderbaumExtension } from "./wb_extension_base";
import { WunderbaumNode } from "./wb_node";
import { ROW_HEIGHT } from "./common";

const nodeMimeType = "application/x-fancytree-node";
export type DropRegionType = "over" | "before" | "after";
type DropRegionTypeSet = Set<DropRegionType>;

export class DndExtension extends WunderbaumExtension {
  // public dropMarkerElem?: HTMLElement;
  protected srcNode: WunderbaumNode | null = null;
  protected lastTargetNode: WunderbaumNode | null = null;
  protected lastEnterStamp = 0;
  protected lastAllowedDropRegions: DropRegionTypeSet | null = null;
  protected lastDropEffect: string | null = null;
  protected lastDropRegion: DropRegionType | false = false;

  constructor(tree: Wunderbaum) {
    super(tree, "dnd", {
      autoExpandMS: 1500, // Expand nodes after n milliseconds of hovering
      // dropMarkerInsertOffsetX: -16, // Additional offset for drop-marker with hitMode = "before"/"after"
      // dropMarkerOffsetX: -24, // Absolute position offset for .fancytree-drop-marker relatively to ..fancytree-title (icon/img near a node accepting drop)
      // #1021 `document.body` is not available yet
      // dropMarkerParent: "body", // Root Container used for drop marker (could be a shadow root)
      multiSource: false, // true: Drag multiple (i.e. selected) nodes. Also a callback() is allowed
      effectAllowed: "all", // Restrict the possible cursor shapes and modifier operations (can also be set in the dragStart event)
      // dropEffect: "auto", // 'copy'|'link'|'move'|'auto'(calculate from `effectAllowed`+modifier keys) or callback(node, data) that returns such string.
      dropEffectDefault: "move", // Default dropEffect ('copy', 'link', or 'move') when no modifier is pressed (overide in dragDrag, dragOver).
      preventForeignNodes: false, // Prevent dropping nodes from different Fancytrees
      preventLazyParents: true, // Prevent dropping items on unloaded lazy Fancytree nodes
      preventNonNodes: false, // Prevent dropping items other than Fancytree nodes
      preventRecursion: true, // Prevent dropping nodes on own descendants
      preventSameParent: false, // Prevent dropping nodes under same direct parent
      preventVoidMoves: true, // Prevent dropping nodes 'before self', etc.
      scroll: true, // Enable auto-scrolling while dragging
      scrollSensitivity: 20, // Active top/bottom margin in pixel
      scrollSpeed: 5, // Pixel per event
      // setTextTypeJson: false, // Allow dragging of nodes to different IE windows
      sourceCopyHook: null, // Optional callback passed to `toDict` on dragStart @since 2.38
      // Events (drag support)
      dragStart: null, // Callback(sourceNode, data), return true, to enable dnd drag
      dragDrag: util.noop, // Callback(sourceNode, data)
      dragEnd: util.noop, // Callback(sourceNode, data)
      // Events (drop support)
      dragEnter: null, // Callback(targetNode, data), return true, to enable dnd drop
      dragOver: util.noop, // Callback(targetNode, data)
      dragExpand: util.noop, // Callback(targetNode, data), return false to prevent autoExpand
      dragDrop: util.noop, // Callback(targetNode, data)
      dragLeave: util.noop, // Callback(targetNode, data)
    });
  }

  init() {
    super.init();

    // Store the current scroll parent, which may be the tree
    // container, any enclosing div, or the document.
    // #761: scrollParent() always needs a container child
    // $temp = $("<span>").appendTo(this.$container);
    // this.$scrollParent = $temp.scrollParent();
    // $temp.remove();
    const tree = this.tree;
    const dndOpts = tree.options.dnd;

    // Enable drag support if dragStart() is specified:
    if (dndOpts.dragStart) {
      onEvent(
        tree.element,
        "dragstart drag dragend",
        (<EventCallbackType>this.onDragEvent).bind(this)
      );
    }
    // Enable drop support if dragEnter() is specified:
    if (dndOpts.dragEnter) {
      onEvent(
        tree.element,
        "dragenter dragover dragleave drop",
        (<EventCallbackType>this.onDropEvent).bind(this)
      );
    }
  }

  /** Cleanup classes after target node is no longer hovered. */
  protected _leaveNode(): void {
    // We remove the marker on dragenter from the previous target:
    const ltn = this.lastTargetNode;
    this.lastEnterStamp = 0;
    if (ltn) {
      ltn.removeClass(
        "wb-drop-target wb-drop-over wb-drop-after wb-drop-before"
      );
      this.lastTargetNode = null;
    }
  }

  /** */
  protected unifyDragover(res: any): DropRegionTypeSet | false {
    if (res === false) {
      return false;
    } else if (res instanceof Set) {
      return res.size > 0 ? res : false;
    } else if (res === true) {
      return new Set<DropRegionType>(["over", "before", "after"]);
    } else if (typeof res === "string" || util.isArray(res)) {
      res = <DropRegionTypeSet>util.toSet(res);
      return res.size > 0 ? res : false;
    }
    throw new Error("Unsupported drop region definition: " + res);
  }

  /** */
  protected _calcDropRegion(
    e: DragEvent,
    allowed: DropRegionTypeSet | null
  ): DropRegionType | false {
    const dy = e.offsetY;

    if (!allowed) {
      return false;
    } else if (allowed.size === 3) {
      return dy < 0.25 * ROW_HEIGHT
        ? "before"
        : dy > 0.75 * ROW_HEIGHT
        ? "after"
        : "over";
    } else if (allowed.size === 1 && allowed.has("over")) {
      return "over";
    } else {
      // Only 'before' and 'after':
      return dy > ROW_HEIGHT / 2 ? "after" : "before";
    }
    return "over";
  }

  protected onDragEvent(e: DragEvent) {
    // const tree = this.tree;
    const dndOpts = this.treeOpts.dnd;
    const srcNode = Wunderbaum.getNode(e);

    if (!srcNode) {
      return;
    }
    if (e.type !== "drag") {
      this.tree.logDebug("onDragEvent." + e.type + ", srcNode: " + srcNode, e);
    }
    if (e.type === "dragstart") {
      // Set a default definition of allowed effects
      e.dataTransfer!.effectAllowed = dndOpts.effectAllowed; //"copyMove"; // "all";
      // Let user cancel the drag operation, override effectAllowed, etc.:
      const res = srcNode._callEvent("dnd.dragStart", { event: e });
      if (!res) {
        e.preventDefault();
        return false;
      }
      let nodeData = srcNode.toDict(true, (n: any) => {
        // We don't want to re-use the key on drop:
        n._org_key = n.key;
        delete n.key;
      });
      nodeData.treeId = srcNode.tree.id;

      const json = JSON.stringify(nodeData);
      e.dataTransfer!.setData(nodeMimeType, json);
      // e.dataTransfer!.setData("text/html", $(node.span).html());
      e.dataTransfer!.setData("text/plain", srcNode.title);
      this.srcNode = srcNode;
      setTimeout(() => {
        // Decouple this call, so the CSS is applied to the node, but not to
        // the system generated drag image
        srcNode.addClass("wb-drag-source");
      }, 0);
    } else if (e.type === "drag") {
      // This event occurs very often...
    } else if (e.type === "dragend") {
      srcNode.removeClass("wb-drag-source");
      this.srcNode = null;
      if (this.lastTargetNode) {
        this._leaveNode();
      }
    }
    return true;
  }

  protected onDropEvent(e: DragEvent) {
    // const isLink = event.dataTransfer.types.includes("text/uri-list");
    const targetNode = Wunderbaum.getNode(e)!;
    const dndOpts = this.treeOpts.dnd;
    const dt = e.dataTransfer!;

    if (!targetNode) {
      this._leaveNode();
      return;
    }
    if (e.type !== "dragover") {
      this.tree.logDebug(
        "onDropEvent." +
          e.type +
          " targetNode: " +
          targetNode +
          ", ea: " +
          dt?.effectAllowed +
          ", de: " +
          dt?.dropEffect,
        ", cy: " + e.offsetY,
        ", r: " + this._calcDropRegion(e, this.lastAllowedDropRegions),
        e
      );
    }
    if (e.type === "dragenter") {
      this.lastAllowedDropRegions = null;
      // `dragleave` is not reliable with event delegation, so we generate it
      // from dragenter:
      if (this.lastTargetNode && this.lastTargetNode !== targetNode) {
        this._leaveNode();
      }
      this.lastTargetNode = targetNode;
      this.lastEnterStamp = Date.now();

      // Don't allow void operation ('drop on self')
      if (dndOpts.preventVoidMoves && targetNode === this.srcNode) {
        dt.dropEffect = "none";
        return true; // Prevent drop operation
      }
      // User may return a set of regions (or `false` to prevent drop)
      let regionSet = targetNode._callEvent("dnd.dragEnter", { event: e });
      //
      regionSet = this.unifyDragover(regionSet);
      if (!regionSet) {
        dt.dropEffect = "none";
        return true; // Prevent drop operation
      }
      this.lastAllowedDropRegions = regionSet;
      this.lastDropEffect = dt.dropEffect;
      targetNode.addClass("wb-drop-target");

      e.preventDefault(); // Allow drop (Drop operation is denied by default)
      return false;
    } else if (e.type === "dragover") {
      const region = this._calcDropRegion(e, this.lastAllowedDropRegions);

      this.lastDropRegion = region;

      if (
        dndOpts.autoExpandMS > 0 &&
        targetNode.isExpandable(true) &&
        !targetNode._isLoading &&
        Date.now() - this.lastEnterStamp > dndOpts.autoExpandMS &&
        targetNode._callEvent("dnd.dragExpand", { event: e }) !== false
      ) {
        targetNode.setExpanded();
      }

      if (!region) {
        return; // We already rejected in dragenter
      }
      targetNode.toggleClass("wb-drop-over", region === "over");
      targetNode.toggleClass("wb-drop-before", region === "before");
      targetNode.toggleClass("wb-drop-after", region === "after");
      // console.log("dragover", e);

      // dt.dropEffect = this.lastDropEffect!;
      e.preventDefault(); // Allow drop (Drop operation is denied by default)
      return false;
    } else if (e.type === "dragleave") {
      // NOTE: we cannot trust this event, since it is always fired,
      // Instead we remove the marker on dragenter
    } else if (e.type === "drop") {
      e.stopPropagation(); // prevent browser from opening links?
      this._leaveNode();
      targetNode._callEvent("dnd.drop", {
        event: e,
        region: this.lastDropRegion,
        sourceNode: this.srcNode,
      });
    }
  }
}
