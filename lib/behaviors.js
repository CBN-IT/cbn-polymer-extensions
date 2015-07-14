/**
 * A Polymer 1.0 behavior-like library for mixing Polymer prototypes that also combines their published properties, 
 * event handlers etc.
 * 
 * Currently supports:
 * - lifecycle methods (created, ready, attached, domReady, detached, attributeChanged);
 * - published and computed properties (via `publish`/`computed`);
 * - '*Changed' methods chaining (does not support `observe` methods, yet).
 * 
 * The prototype of the element needs to be passed through the {@link Polymer#implementBehaviors} method.
 * Behaviors can be specified via the `behaviors` prototype property or as var args inside the implement method.
 */

(function(Polymer) {
	
	// implementation details
	var alwaysExtendMethods = ["created", "ready", "attached", "domReady", "detached", "attributeChanged"];
	var alwaysExtendProperties = ["publish", "computed", "eventDelegates", "observe"];
	var alwaysIgnoreProperties = [ "behaviors" ];
	
	// Utility functions:
	
	/**
	 * Copies a property from a source object to a target object.
	 * 
	 * @param {String} name The name of the property to copy.
	 * @param {Object} source The source object.
	 * @param {Object} target The target object.
	 */
	function copyProperty(name, source, target) {
		var pd = getPropertyDescriptor(source, name);
		Object.defineProperty(target, name, pd);
	}
	
	/**
	 * Returns the property descriptor of an object; searches the object's prototype chain
	 * 
	 * @param {Object} obj The parent object to fetch the descriptor for.
	 * @param {String} name Property name.
	 * @returns {Object|*} The requested property descriptor, false if not found.
	 */
	function getPropertyDescriptor(obj, name) {
		if (obj) {
			var pd = Object.getOwnPropertyDescriptor(obj, name);
			return pd || getPropertyDescriptor(Object.getPrototypeOf(obj), name);
		}
		return false;
	}
	
	/**
	 * Copies and extends an Object/Array property.
	 * 
	 * @param {String} name The name of the property to copy/extend.
	 * @param {Object} source The source object.
	 * @param {Object} target The target object.
	 */
	function extendProperty(name, source, target) {
		// extend the property (if it is an array or an object)
		if (source[name] instanceof Array) {
			if (!target[name]) target[name] = [];
			target[name] = target[name].concat(source[name]);
			
		} else if (typeof source[name] == 'object') {
			if (!target[name]) target[name] = {};
			for (var nk in source[name]) {
				if (!source[name].hasOwnProperty(nk)) continue;
				copyProperty(nk, source[name], target[name]);
			}
		}
	}
	
	/**
	 * Returns proxy method that calls the object's own method and its behaviors' (if overridden).
	 * 
	 * @param {String} method The name of the extended method.
	 * @param {Function} original The original method to call.
	 * @returns {Function} The proxy function to use.
	 */
	function proxyMethodImpl(method, original) {
		return function() {
			var args = arguments;
			var obj = this;
			
			if (original)
				original.apply(obj, args);
			
			if (!this.behaviors || !this.behaviors.length)
				return;
			this.behaviors.forEach(function(behavior) {
				if (behavior.hasOwnProperty(method)) {
					behavior[method].apply(obj, args);
				}
			});
		};
	}
	
	/**
	 * Flattens an array of objects (that contain other arrays).
	 * 
	 * @param arr The array to flatten.
	 */
	function flattenArray(arr) {
		var result = [];
		for (var i=0; i<arr.length; i++) {
			if (Array.isArray(arr[i])) {
				result = result.concat(flattenArray(arr[i]));
			} else {
				result.push(arr[i]);
			}
		}
		return result;
	}
	
	/**
	 * De-duplicates an array (filters duplicate values).
	 * 
	 * @param {Array} a The source array.
	 * @returns {Array} The de-duplicated array.
	 */
	function uniqueArray(a) {
		return a.reduce(function(p, c) {
			if (p.indexOf(c) == -1) p.push(c);
			return p;
		}, []);
	}
	
	/**
	 * Returns true if the specified method should be extended.
	 * 
	 * @param name The name of the method.
	 * @returns {boolean} Whether the method is a lifecycle / observer method.
	 */
	function shouldExtendMethod(name) {
		return ( (alwaysExtendMethods.indexOf(name) > -1) || 
			     (/^[a-zA-Z0-9_]+Changed$/.test(name)) );
	}
	
	/**
	 * Method used for implementing the behaviors / interfaces for a polymer component.
	 * 
	 * @param {Object} original The target object to extend.
	 * @param {...Object} var_args The interfaces to implement.
	 * @return {Object} The extended object.
	 */
	Polymer.implementBehaviors = function (original, var_args/*...*/) {
		var i, p, n; // iterators / auxiliary variables
		
		// create a new prototype object
		var obj = {};
		
		/**
		 * Stores the references of all behaviors implemented so far.
		 * @property behaviors
		 * @type {Object[]}
		 */
		obj.behaviors = [];
		
		// build the behaviors list
		if (original.behaviors && original.behaviors.length) {
			obj.behaviors = original.behaviors.slice();
		}
		for (i=1; i<arguments.length; i++) {
			obj.behaviors.push(arguments[i]);
		}
		obj.behaviors = uniqueArray(flattenArray(obj.behaviors));
		
		// copy the behavior properties (using the list order)
		var toProxyMethods = {};
		for (i = 0; i <= obj.behaviors.length; i++) {
			// use the same loop for the original prototype, too
			if (i == obj.behaviors.length) {
				p = original;
			} else {
				p = obj.behaviors[i];
			}
			
			for (n in p) {
				try {
					if (!p.hasOwnProperty(n)) continue;
					
					if (shouldExtendMethod(n)) {
						// will use a proxy method that calls it
						if (p == original) {
							if (!toProxyMethods[n] > -1) {
								// no need for proxy, just copy it
								copyProperty(n, original, obj);
							}
						} else {
							toProxyMethods[n] = true;
						}
						
					} else if (alwaysExtendProperties.indexOf(n) != -1) {
						extendProperty(n, p, obj);
						
					} else if (alwaysIgnoreProperties.indexOf(n) == -1) {
						// just copy it (if it doesn't override)
						copyProperty(n, p, obj);
					}
					
				} catch (e) {
					console.error("Polymer.implementBehaviors: unable to copy/extend property '" + n + "'",
						p, e);
				}
			}
		}
		
		// fill the resulting object with proxy methods
		for (n in toProxyMethods) {
			if (toProxyMethods.hasOwnProperty(n))
				obj[n] = proxyMethodImpl(n, original[n]);
		}
		
		return obj;
	};
	
	/**
	 * Checks whether an object implements the specified behavior.
	 * 
	 * @param  {Object}  obj The object to check.
	 * @param  {Object}  behavior The behavior to check if it is implemented by the object.
	 * @return {Boolean} True if the object implements the specified behavior.
	 */
	Polymer.implementsBehavior = function (obj, behavior) {
		if (!obj.behaviors || !obj.behaviors.length) 
			return false;
		return (obj.behaviors.indexOf(behavior) != -1);
	};
	
})(Polymer);
