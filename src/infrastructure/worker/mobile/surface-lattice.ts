/*
 * Adapted from kuromoji.js ViterbiBuilder.
 * Copyright 2014 Takuya Asano
 * Copyright 2010-2014 Atilika Inc. and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import ViterbiLattice from "kuromoji/src/viterbi/ViterbiLattice";
import ViterbiNode from "kuromoji/src/viterbi/ViterbiNode";
import SurrogateAwareString from "kuromoji/src/util/SurrogateAwareString";

interface TokenDictionary {
  target_map: Record<number, Uint32Array>;
  dictionary: { getShort(offset: number): number };
}
interface CharacterClass {
  class_id: number;
  class_name: string;
  is_always_invoke: number;
  is_grouping: number;
}
interface Dictionary {
  trie: { commonPrefixSearch(text: string): { k: string; v: number }[] };
  token_info_dictionary: TokenDictionary;
  unknown_dictionary: TokenDictionary & {
    lookup(char: string): CharacterClass;
  };
}

/** Same lattice and path costs, with one Unicode position table per sentence. */
export function surfaceLatticeBuilder(dictionary: unknown) {
  const dic = dictionary as Dictionary;
  const pool: ViterbiNode[] = [];
  let used = 0;
  const release = () => {
    for (let i = 0; i < Math.min(used, pool.length); i++) {
      pool[i].prev = null;
      pool[i].surface_form = "";
    }
    used = 0;
  };
  const build = (text: string) => {
    const sentence = new SurrogateAwareString(text);
    const lattice = new ViterbiLattice();
    const classes: CharacterClass[] = [];
    const offsets = new Uint32Array(sentence.length + 1);
    const groupEnd = new Uint32Array(sentence.length);
    for (let pos = 0; pos < sentence.length; pos++) {
      const char = sentence.charAt(pos);
      classes.push(dic.unknown_dictionary.lookup(char));
      offsets[pos + 1] = offsets[pos] + char.length;
    }
    for (let pos = sentence.length - 1; pos >= 0; pos--)
      groupEnd[pos] =
        classes[pos].class_name === classes[pos + 1]?.class_name
          ? groupEnd[pos + 1]
          : pos + 1;

    const append = (
      entry: TokenDictionary,
      ids: Uint32Array,
      pos: number,
      length: number,
      type: string,
      surface: string,
    ) => {
      for (const id of ids) {
        const bytes = entry.dictionary;
        let node = pool[used];
        if (!node) {
          node = new ViterbiNode(id, 0, 0, 0, type, 0, 0, "");
          if (used < 8192) pool.push(node);
        }
        used++;
        node.name = id;
        node.cost = bytes.getShort(id + 4);
        node.start_pos = pos + 1;
        node.length = length;
        node.type = type;
        node.left_id = bytes.getShort(id);
        node.right_id = bytes.getShort(id + 2);
        node.surface_form = surface;
        node.prev = null;
        node.shortest_cost = Number.MAX_VALUE;
        lattice.append(node);
      }
    };
    for (let pos = 0; pos < sentence.length; pos++) {
      const vocabulary = dic.trie.commonPrefixSearch(sentence.slice(pos));
      for (const word of vocabulary)
        append(
          dic.token_info_dictionary,
          dic.token_info_dictionary.target_map[word.v],
          pos,
          word.k.length,
          "KNOWN",
          word.k,
        );
      const category = classes[pos];
      if (!vocabulary.length || category.is_always_invoke === 1) {
        const end = category.is_grouping === 1 ? groupEnd[pos] : pos + 1;
        const surface = text.slice(offsets[pos], offsets[end]);
        // Preserve kuromoji's grouped unknown-word length convention.
        const length = end > pos + 1 ? surface.length : 1;
        append(
          dic.unknown_dictionary,
          dic.unknown_dictionary.target_map[category.class_id],
          pos,
          length,
          "UNKNOWN",
          surface,
        );
      }
    }
    lattice.appendEos();
    return lattice;
  };
  return { build, release };
}
