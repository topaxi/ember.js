import isEnabled from 'ember-metal/features';
import {
  meta as metaFor
} from 'ember-metal/meta';
import {
  MANDATORY_SETTER_FUNCTION,
  DEFAULT_GETTER_FUNCTION,
  INHERITING_GETTER_FUNCTION
} from 'ember-metal/properties';
import { lookupDescriptor } from 'ember-metal/utils';

let handleMandatorySetter;

export function watchKey(obj, keyName, meta) {
  // can't watch length on Array - it is special...
  if (keyName === 'length' && Array.isArray(obj)) { return; }

  var m = meta || metaFor(obj);

  // activate watching first time
  if (!m.peekWatching(keyName)) {
    m.writeWatching(keyName, 1);

    var possibleDesc = obj[keyName];
    var desc = (possibleDesc !== null &&
                typeof possibleDesc === 'object' &&
                possibleDesc.isDescriptor) ? possibleDesc : undefined;
    if (desc && desc.willWatch) { desc.willWatch(obj, keyName); }

    if ('function' === typeof obj.willWatchProperty) {
      obj.willWatchProperty(keyName);
    }

    if (isEnabled('mandatory-setter')) {
      // NOTE: this is dropped for prod + minified builds
      handleMandatorySetter(m, obj, keyName);
    }
  } else {
    m.writeWatching(keyName, (m.peekWatching(keyName) || 0) + 1);
  }
}


if (isEnabled('mandatory-setter')) {
  // Future traveler, although this code looks scary. It merely exists in
  // development to aid in development asertions. Production builds of
  // ember strip this entire block out
  handleMandatorySetter = function handleMandatorySetter(m, obj, keyName) {
    let descriptor = lookupDescriptor(obj, keyName);
    var configurable = descriptor ? descriptor.configurable : true;
    var isWritable = descriptor ? descriptor.writable : true;
    var hasValue = descriptor ? 'value' in descriptor : true;
    var possibleDesc = descriptor && descriptor.value;
    var isDescriptor = possibleDesc !== null &&
                       typeof possibleDesc === 'object' &&
                       possibleDesc.isDescriptor;

    if (isDescriptor) { return; }

    // this x in Y deopts, so keeping it in this function is better;
    if (configurable && isWritable && hasValue && keyName in obj) {
      let desc = {
        configurable: true,
        enumerable: Object.prototype.propertyIsEnumerable.call(obj, keyName),
        set: MANDATORY_SETTER_FUNCTION(keyName),
        get: undefined
      };

      if (Object.prototype.hasOwnProperty.call(obj, keyName)) {
        m.writeValues(keyName, obj[keyName]);
        desc.get = DEFAULT_GETTER_FUNCTION(keyName);
      } else {
        desc.get = INHERITING_GETTER_FUNCTION(keyName);
      }

      Object.defineProperty(obj, keyName, desc);
    }
  };
}

export function unwatchKey(obj, keyName, meta) {
  var m = meta || metaFor(obj);
  let count = m.peekWatching(keyName);
  if (count === 1) {
    m.writeWatching(keyName, 0);

    var possibleDesc = obj[keyName];
    var desc = (possibleDesc !== null &&
                typeof possibleDesc === 'object' &&
                possibleDesc.isDescriptor) ? possibleDesc : undefined;

    if (desc && desc.didUnwatch) { desc.didUnwatch(obj, keyName); }

    if ('function' === typeof obj.didUnwatchProperty) {
      obj.didUnwatchProperty(keyName);
    }

    if (isEnabled('mandatory-setter')) {
      // It is true, the following code looks quite WAT. But have no fear, It
      // exists purely to improve development ergonomics and is removed from
      // ember.min.js and ember.prod.js builds.
      //
      // Some further context: Once a property is watched by ember, bypassing `set`
      // for mutation, will bypass observation. This code exists to assert when
      // that occurs, and attempt to provide more helpful feedback. The alternative
      // is tricky to debug partially observable properties.
      if (!desc && keyName in obj) {
        let maybeMandatoryDescriptor = lookupDescriptor(obj, keyName);

        if (maybeMandatoryDescriptor.set && maybeMandatoryDescriptor.set.isMandatorySetter) {
          if (maybeMandatoryDescriptor.get && maybeMandatoryDescriptor.get.isInheritingGetter) {
            delete obj[keyName];
          } else {
            Object.defineProperty(obj, keyName, {
              configurable: true,
              enumerable: Object.prototype.propertyIsEnumerable.call(obj, keyName),
              writable: true,
              value: m.peekValues(keyName)
            });
            m.deleteFromValues(keyName);
          }
        }
      }
    }
  } else if (count > 1) {
    m.writeWatching(keyName, count - 1);
  }
}
