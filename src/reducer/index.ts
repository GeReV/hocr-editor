import { Bbox } from 'tesseract.js';
import { produce } from 'immer';
import type { Draft } from 'immer/dist/types/types-external';

import { BaseTreeItem, ElementType, ItemId, Position } from '../types';
import { buildTree, walkChildren } from '../treeBuilder';
import { TreeDestinationPosition, TreeSourcePosition } from '../components/SortableTree';
import { isLeafItem } from '../components/SortableTree/utils/tree';
import { createUniqueIdentifier } from '../utils';
import { ActionType, AppReducerAction, ModifyNodePayload, OcrDocument, State, TreeItems } from './types';

const offsetBbox = (bbox: Bbox, offset: Position): Bbox => ({
  x0: bbox.x0 + offset.x,
  y0: bbox.y0 + offset.y,
  x1: bbox.x1 + offset.x,
  y1: bbox.y1 + offset.y,
});

export const initialState: State = {
  snapshots: [],
  currentSnapshot: -1,
  documents: [],
  currentDocument: 0,
  selectedId: null,
  hoveredId: null,
  lastRecognizeUpdate: null,
};

export function getNodeOrThrow(treeItems: TreeItems, nodeId: ItemId): BaseTreeItem<ElementType, any> {
  const node = treeItems[nodeId.toString()];

  if (!node) {
    throw new Error(`Could not find node with ID ${nodeId}.`);
  }

  return node;
}

function updateTreeNodePosition(
  state: State,
  nodeId: ItemId,
  x: number,
  y: number,
  width: number | undefined,
  height: number | undefined,
): State {
  return produceWithUndo(state, (draft) => {
    const tree = draft.documents[draft.currentDocument].tree;

    if (!tree) {
      return;
    }

    const treeItems = tree.items;

    const node = getNodeOrThrow(treeItems, nodeId);

    const delta: Position = {
      x: x - node.parentRelativeOffset.x,
      y: y - node.parentRelativeOffset.y,
    };

    const newPosition: Position = {
      x: node.data.bbox.x0 + delta.x,
      y: node.data.bbox.y0 + delta.y,
    };

    // TODO: Round and clamp to parent bounds.
    const newBbox: Bbox = {
      x0: newPosition.x,
      y0: newPosition.y,
      x1: typeof width === 'undefined' ? node.data.bbox.x1 + delta.x : newPosition.x + width,
      y1: typeof height === 'undefined' ? node.data.bbox.y1 + delta.y : newPosition.y + height,
    };

    node.parentRelativeOffset = { x, y };
    node.data.bbox = newBbox;

    walkChildren(node.children, treeItems, (item) => {
      if (item.type === ElementType.Page) {
        return;
      }

      item.data.bbox = offsetBbox(item.data.bbox, delta);
    });
  });
}

function moveTreeNode(state: State, source: TreeSourcePosition, destination: TreeDestinationPosition): State {
  return produceWithUndo(state, (draft) => {
    const tree = draft.documents[draft.currentDocument].tree;

    if (!tree) {
      throw new Error('Cannot move node when no tree exists. This should never happen.');
    }

    const sourceParent = tree.items[source.parentId];
    const destinationParent = tree.items[destination.parentId];

    const item = sourceParent.children.splice(source.index, 1)[0];

    sourceParent.isExpanded = sourceParent.children.length > 0 && sourceParent.isExpanded;

    if (typeof destination.index === 'undefined') {
      if (isLeafItem(destinationParent)) {
        destinationParent.children.push(item);
      }
    } else {
      destinationParent.children.splice(destination.index, 0, item);
    }
  });
}

function deleteTreeNode(state: State, nodeId: ItemId): State {
  return produceWithUndo(state, (draft) => {
    const tree = draft.documents[draft.currentDocument].tree;

    if (!tree) {
      return;
    }

    const treeItems = tree.items;

    const node = getNodeOrThrow(treeItems, nodeId);

    if (node.parentId !== null) {
      const parent = getNodeOrThrow(treeItems, node.parentId);

      const nodeIndex = parent.children.indexOf(nodeId.toString());

      if (nodeIndex < 0) {
        throw new Error(`Node with ID ${nodeId} was expected to be a child of node with ID ${parent.id}.`);
      }

      parent.children.splice(nodeIndex, 1);
    }

    walkChildren(node.children, treeItems, (item) => {
      delete treeItems[item.id];
    });

    delete treeItems[nodeId.toString()];
  });
}

function modifyTreeNode(state: State, payload: ModifyNodePayload): State {
  return produceWithUndo(state, (draft) => {
    const tree = draft.documents[draft.currentDocument].tree;

    if (!tree) {
      return;
    }

    const treeItems = tree.items;

    const node = getNodeOrThrow(treeItems, payload.itemId);

    const changes = payload.changes;

    if (typeof changes.isExpanded !== 'undefined') {
      node.isExpanded = changes.isExpanded;
    }

    if (typeof changes.text !== 'undefined') {
      node.data.text = changes.text;
    }
  });
}

const documentId = createUniqueIdentifier();

function reduce(state: State, action: AppReducerAction): State {
  switch (action.type) {
    case ActionType.AddDocument: {
      return produceWithUndo(state, (draft) => {
        draft.documents.push({
          id: documentId(),
          isProcessing: false,
          filename: action.payload.filename,
          pageImage: action.payload.pageImage,
          tree: null,
        });
      });
    }
    case ActionType.RecognizeDocument: {
      return produceWithUndo(state, (draft) => {
        const [rootId, items] = buildTree(action.payload.result);

        const document = draft.documents.find((doc: OcrDocument) => doc.id === action.payload.id);

        if (!document) {
          throw new Error(`Document with ID ${action.payload.id} not found.`);
        }

        document.tree = {
          rootId,
          items,
        };
      });
    }
    case ActionType.SelectDocument: {
      return produceWithUndo(state, (draft) => {
        draft.currentDocument = action.payload;
      });
    }
    case ActionType.ChangeSelected: {
      return produceWithUndo(state, (draft) => {
        draft.selectedId = action.payload;
      });
    }
    case ActionType.ChangeHovered: {
      return produce(state, (draft) => {
        draft.hoveredId = action.payload;
      });
    }
    case ActionType.ChangeDocumentIsProcessing: {
      return produce(state, (draft) => {
        const document = draft.documents.find((doc) => doc.id === action.payload.id);

        if (!document) {
          throw new Error(`Document with ID ${action.payload.id} not found.`);
        }

        document.isProcessing = action.payload.isProcessing;
      });
    }
    case ActionType.UpdateTreeNodeRect: {
      return updateTreeNodePosition(
        state,
        action.payload.nodeId,
        action.payload.x,
        action.payload.y,
        action.payload.width,
        action.payload.height,
      );
    }
    case ActionType.ModifyNode: {
      return modifyTreeNode(state, action.payload);
    }
    case ActionType.DeleteNode: {
      return deleteTreeNode(state, action.payload);
    }
    case ActionType.MoveNode: {
      return moveTreeNode(state, action.payload.source, action.payload.destination);
    }
    case ActionType.LogUpdate: {
      return produce(state, (draft) => {
        draft.lastRecognizeUpdate = action.payload;
      });
    }
    default:
      throw new Error(`Unknown action ${JSON.stringify(action)}`);
  }
}

export function produceWithUndo(state: State, action: (draft: Draft<State>) => void): State {
  const newState = produce(state, action);

  return produce(newState, (draft) => {
    const { snapshots, currentSnapshot, ...rest } = draft;

    if (snapshots.length === MAX_CHANGESETS) {
      draft.snapshots.shift();
    }

    // When we've undone a few steps and make a new change, delete all future steps to start a new "timeline".
    if (draft.currentSnapshot < draft.snapshots.length - 1) {
      draft.snapshots = draft.snapshots.slice(0, draft.currentSnapshot);
    }

    draft.snapshots.push(rest);
    draft.currentSnapshot = Math.min(draft.snapshots.length - 1, MAX_CHANGESETS - 1);
  });
}

const MAX_CHANGESETS = 40;

export function reducer(state: State, action: AppReducerAction): State {
  const snapshotLastIndex = state.snapshots.length - 1;

  if (action.type === ActionType.Undo) {
    console.debug(state.snapshots);
    if (state.currentSnapshot <= 0) {
      console.debug(state.currentSnapshot, '/', snapshotLastIndex);

      return state;
    }

    const changes = state.snapshots[state.currentSnapshot - 1];

    console.debug(state.currentSnapshot - 1, '/', snapshotLastIndex);

    return {
      ...state,
      ...changes,
      currentSnapshot: state.currentSnapshot - 1,
    };
  }

  if (action.type === ActionType.Redo) {
    console.debug(state.snapshots);
    if (state.currentSnapshot === snapshotLastIndex) {
      console.debug(state.currentSnapshot, '/', snapshotLastIndex);

      return state;
    }

    const changes = state.snapshots[state.currentSnapshot + 1];

    console.debug(state.currentSnapshot + 1, '/', snapshotLastIndex);

    return {
      ...state,
      ...changes,
      currentSnapshot: state.currentSnapshot + 1,
    };
  }

  return reduce(state, action);
}
