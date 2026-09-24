# Python Tutorial (excerpt)

Distractor document for the #1341 off-topic eval suite. From the CPython documentation, Doc/tutorial/*.rst, (c) Python Software Foundation, PSF License Version 2.

.. _tut-morecontrol:

***********************
More Control Flow Tools
***********************

As well as the :keyword:`while` statement just introduced, Python uses a few more
that we will encounter in this chapter.

.. _tut-if:

:keyword:`!if` Statements
=========================

Perhaps the most well-known statement type is the :keyword:`if` statement.  For
example::

   >>> x = int(input("Please enter an integer: "))
   Please enter an integer: 42
   >>> if x < 0:
   ...     x = 0
   ...     print('Negative changed to zero')
   ... elif x == 0:
   ...     print('Zero')
   ... elif x == 1:
   ...     print('Single')
   ... else:
   ...     print('More')
   ...
   More

There can be zero or more :keyword:`elif` parts, and the :keyword:`else` part is
optional.  The keyword ':keyword:`!elif`' is short for 'else if', and is useful
to avoid excessive indentation.  An  :keyword:`!if` ... :keyword:`!elif` ...
:keyword:`!elif` ... sequence is a substitute for the ``switch`` or
``case`` statements found in other languages.

If you're comparing the same value to several constants, or checking for specific types or
attributes, you may also find the :keyword:`!match` statement useful. For more
details see :ref:`tut-match`.

.. _tut-for:

:keyword:`!for` Statements
==========================

.. index::
   pair: statement; for

The :keyword:`for` statement in Python differs a bit from what you may be used
to in C or Pascal.  Rather than always iterating over an arithmetic progression
of numbers (like in Pascal), or giving the user the ability to define both the
iteration step and halting condition (as C), Python's :keyword:`!for` statement
iterates over the items of any sequence (a list or a string), in the order that
they appear in the sequence.  For example (no pun intended):

.. One suggestion was to give a real C example here, but that may only serve to
   confuse non-C programmers.

::

   >>> # Measure some strings:
   >>> words = ['cat', 'window', 'defenestrate']
   >>> for w in words:
   ...     print(w, len(w))
   ...
   cat 3
   window 6
   defenestrate 12

Code that modifies a collection while iterating over that same collection can
be tricky to get right.  Instead, it is usually more straight-forward to loop
over a copy of the collection or to create a new collection::

    # Create a sample collection
    users = {'Hans': 'active', 'Éléonore': 'inactive', '景太郎': 'active'}

    # Strategy:  Iterate over a copy
    for user, status in users.copy().items():
        if status == 'inactive':
            del users[user]

    # Strategy:  Create a new collection
    active_users = {}
    for user, status in users.items():
        if status == 'active':
            active_users[user] = status

.. _tut-range:

The :func:`range` Function
==========================

If you do need to iterate over a sequence of numbers, the built-in function
:func:`range` comes in handy.  It generates arithmetic progressions::

    >>> for i in range(5):
    ...     print(i)
    ...
    0
    1
    2
    3
    4

The given end point is never part of the generated sequence; ``range(10)`` generates
10 values, the legal indices for items of a sequence of length 10.  It
is possible to let the range start at another number, or to specify a different
increment (even negative; sometimes this is called the 'step')::

    >>> list(range(5, 10))
    [5, 6, 7, 8, 9]

    >>> list(range(0, 10, 3))
    [0, 3, 6, 9]

    >>> list(range(-10, -100, -30))
    [-10, -40, -70]

To iterate over the indices of a sequence, you can combine :func:`range` and
:func:`len` as follows::

   >>> a = ['Mary', 'had', 'a', 'little', 'lamb']
   >>> for i in range(len(a)):
   ...     print(i, a[i])
   ...
   0 Mary
   1 had
   2 a
   3 little
   4 lamb

In most such cases, however, it is convenient to use the :func:`enumerate`
function, see :ref:`tut-loopidioms`.

A strange thing happens if you just print a range::

   >>> range(10)
   range(0, 10)

In many ways the object returned by :func:`range` behaves as if it is a list,
but in fact it isn't. It is an object which returns the successive items of
the desired sequence when you iterate over it, but it doesn't really make
the list, thus saving space.

We say such an object is :term:`iterable`, that is, suitable as a target for
functions and constructs that expect something from which they can
obtain successive items until the supply is :term:`exhausted`.  We have seen that
the :keyword:`for` statement is such a construct, while an example of a function
that takes an iterable is :func:`sum`::

    >>> sum(range(4))  # 0 + 1 + 2 + 3
    6

Later we will see more functions that return iterables and take iterables as
arguments.  In chapter :ref:`tut-structures`, we will discuss :func:`list` in more
detail.

.. _tut-break:

:keyword:`!break` and :keyword:`!continue` Statements
=====================================================

The :keyword:`break` statement breaks out of the innermost enclosing
:keyword:`for` or :keyword:`while` loop::

    >>> for n in range(2, 10):
    ...     for x in range(2, n):
    ...         if n % x == 0:
    ...             print(f"{n} equals {x} * {n//x}")
    ...             break
    ...
    4 equals 2 * 2
    6 equals 2 * 3
    8 equals 2 * 4
    9 equals 3 * 3

The :keyword:`continue` statement continues with the next
iteration of the loop::

    >>> for num in range(2, 10):
    ...     if num % 2 == 0:
    ...         print(f"Found an even number {num}")
    ...         continue
    ...     print(f"Found an odd number {num}")
    ...
    Found an even number 2
    Found an odd number 3
    Found an even number 4
    Found an odd number 5
    Found an even number 6
    Found an odd number 7
    Found an even number 8
    Found an odd number 9

.. _tut-for-else:
.. _break-and-continue-statements-and-else-clauses-on-loops:

:keyword:`!else` Clauses on Loops
=================================

In a :keyword:`!for` or :keyword:`!while` loop the :keyword:`!break` statement
may be paired with an :keyword:`!else` clause.  If the loop finishes without
executing the :keyword:`!break`, the :keyword:`!else` clause executes.

In a :keyword:`for` loop, the :keyword:`!else` clause is executed
after the loop finishes its final iteration, that is, if no break occurred.

In a :keyword:`while` loop, it's executed after the loop's condition becomes false.

In either kind of loop, the :keyword:`!else` clause is **not** executed if the
loop was terminated by a :keyword:`break`.  Of course, other ways of ending the
loop early, such as a :keyword:`return` or a raised exception, will also skip
execution of the :keyword:`else` clause.

This is exemplified in the following :keyword:`!for` loop,
which searches for prime numbers::

   >>> for n in range(2, 10):
   ...     for x in range(2, n):
   ...         if n % x == 0:
   ...             print(n, 'equals', x, '*', n//x)
   ...             break
   ...     else:
   ...         # loop fell through without finding a factor
   ...         print(n, 'is a prime number')
   ...
   2 is a prime number
   3 is a prime number
   4 equals 2 * 2
   5 is a prime number
   6 equals 2 * 3
   7 is a prime number
   8 equals 2 * 4
   9 equals 3 * 3

(Yes, this is the correct code.  Look closely: the ``else`` clause belongs to
the ``for`` loop, **not** the ``if`` statement.)

One way to think of the else clause is to imagine it paired with the ``if``
inside the loop.  As the loop executes, it will run a sequence like
if/if/if/else. The ``if`` is inside the loop, encountered a number of times. If
the condition is ever true, a ``break`` will happen. If the condition is never
true, the ``else`` clause outside the loop will execute.

When used with a loop, the ``else`` clause has more in common with the ``else``
clause of a :keyword:`try` statement than it does with that of ``if``
statements: a ``try`` statement's ``else`` clause runs when no exception
occurs, and a loop's ``else`` clause runs when no ``break`` occurs. For more on
the ``try`` statement and exceptions, see :ref:`tut-handling`.

.. index:: single: ...; ellipsis literal
.. _tut-pass:

:keyword:`!pass` Statements
===========================

The :keyword:`pass` statement does nothing. It can be used when a statement is
required syntactically but the program requires no action. For example::

   >>> while True:
   ...     pass  # Busy-wait for keyboard interrupt (Ctrl+C)
   ...

This is commonly used for creating minimal classes::

   >>> class MyEmptyClass:
   ...     pass
   ...

Another place :keyword:`pass` can be used is as a place-holder for a function or
conditional body when you are working on new code, allowing you to keep thinking
at a more abstract level.  The :keyword:`!pass` is silently ignored::

   >>> def initlog(*args):
   ...     pass   # Remember to implement this!
   ...

For this last case, many people use the ellipsis literal :code:`...` instead of
:code:`pass`. This use has no special meaning to Python, and is not part of
the language definition (you could use any constant expression here), but
:code:`...` is used conventionally as a placeholder body as well.
See :ref:`bltin-ellipsis-object`.

.. _tut-match:

:keyword:`!match` Statements
============================

A :keyword:`match` statement takes an expression and compares its value to successive
patterns given as one or more case blocks.  This is superficially
similar to a switch statement in C, Java or JavaScript (and many
other languages), but it's more similar to pattern matching in
languages like Rust or Haskell. Only the first pattern that matches
gets executed and it can also extract components (sequence elements
or object attributes) from the value into variables. If no case matches,
none of the branches is executed.

The simplest form compares a subject value against one or more literals::

    def http_error(status):
        match status:
            case 400:
                return "Bad request"
            case 404:
                return "Not found"
            case 418:
                return "I'm a teapot"
            case _:
                return "Something's wrong with the internet"

Note the last block: the "variable name" ``_`` acts as a *wildcard* and
never fails to match.

You can combine several literals in a single pattern using ``|`` ("or")::

            case 401 | 403 | 404:
                return "Not allowed"

Patterns can look like unpacking assignments, and can be used to bind
variables::

    # point is an (x, y) tuple
    match point:
        case (0, 0):
            print("Origin")
        case (0, y):
            print(f"Y={y}")
        case (x, 0):
            print(f"X={x}")
        case (x, y):
            print(f"X={x}, Y={y}")
        case _:
            raise ValueError("Not a point")

Study that one carefully!  The first pattern has two literals, and can
be thought of as an extension of the literal pattern shown above.  But
the next two patterns combine a literal and a variable, and the
variable *binds* a value from the subject (``point``).  The fourth
pattern captures two values, which makes it conceptually similar to
the unpacking assignment ``(x, y) = point``.

If you are using classes to structure your data
you can use the class name followed by an argument list resembling a
constructor, but with the ability to capture attributes into variables::

    class Point:
        def __init__(self, x, y):
            self.x = x
            self.y = y

    def where_is(point):
        match point:
            case Point(x=0, y=0):
                print("Origin")
            case Point(x=0, y=y):
                print(f"Y={y}")
            case Point(x=x, y=0):
                print(f"X={x}")
            case Point():
                print("Somewhere else")
            case _:
                print("Not a point")

You can use positional parameters with some builtin classes that provide an
ordering for their attributes (e.g. dataclasses). You can also define a specific
position for attributes in patterns by setting the ``__match_args__`` special
attribute in your classes. If it's set to ("x", "y"), the following patterns are all
equivalent (and all bind the ``y`` attribute to the ``var`` variable)::

    Point(1, var)
    Point(1, y=var)
    Point(x=1, y=var)
    Point(y=var, x=1)

A recommended way to read patterns is to look at them as an extended form of what you
would put on the left of an assignment, to understand which variables would be set to
what.
Only the standalone names (like ``var`` above) are assigned to by a match statement.
Dotted names (like ``foo.bar``), attribute names (the ``x=`` and ``y=`` above) or class names
(recognized by the "(...)" next to them like ``Point`` above) are never assigned to.

Patterns can be arbitrarily nested.  For example, if we have a short
list of Points, with ``__match_args__`` added, we could match it like this::

    class Point:
        __match_args__ = ('x', 'y')
        def __init__(self, x, y):
            self.x = x
            self.y = y

    match points:
        case []:
            print("No points")
        case [Point(0, 0)]:
            print("The origin")
        case [Point(x, y)]:
            print(f"Single point {x}, {y}")
        case [Point(0, y1), Point(0, y2)]:
            print(f"Two on the Y axis at {y1}, {y2}")
        case _:
            print("Something else")

We can add an ``if`` clause to a pattern, known as a "guard".  If the
guard is false, ``match`` goes on to try the next case block.  Note
that value capture happens before the guard is evaluated::

    match point:
        case Point(x, y) if x == y:
            print(f"Y=X at {x}")
        case Point(x, y):
            print(f"Not on the diagonal")

Several other key features of this statement:

- Like unpacking assignments, tuple and list patterns have exactly the
  same meaning and actually match arbitrary sequences.  An important
  exception is that they don't match iterators or strings.

- Sequence patterns support extended unpacking: ``[x, y, *rest]`` and ``(x, y,
  *rest)`` work similar to unpacking assignments.  The
  name after ``*`` may also be ``_``, so ``(x, y, *_)`` matches a sequence
  of at least two items without binding the remaining items.

- Mapping patterns: ``{"bandwidth": b, "latency": l}`` captures the
  ``"bandwidth"`` and ``"latency"`` values from a dictionary.  Unlike sequence
  patterns, extra keys are ignored.  An unpacking like ``**rest`` is also
  supported.  (But ``**_`` would be redundant, so it is not allowed.)

- Subpatterns may be captured using the ``as`` keyword::

      case (Point(x1, y1), Point(x2, y2) as p2): ...

  will capture the second element of the input as ``p2`` (as long as the input is
  a sequence of two points)

- Most literals are compared by equality, however the singletons ``True``,
  ``False`` and ``None`` are compared by identity.

- Patterns may use named constants.  These must be dotted names
  to prevent them from being interpreted as capture variables::

      from enum import Enum
      class Color(Enum):
          RED = 'red'
          GREEN = 'green'
          BLUE = 'blue'

      color = Color(input("Enter your choice of 'red', 'blue' or 'green': "))

      match color:
          case Color.RED:
              print("I see red!")
          case Color.GREEN:
              print("Grass is green")
          case Color.BLUE:
              print("I'm feeling the blues :(")

For a more detailed explanation and additional examples, you can look into
:pep:`636` which is written in a tutorial format.

.. _tut-functions:

Defining Functions
==================

We can create a function that writes the Fibonacci series to an arbitrary
boundary::

   >>> def fib(n):    # write Fibonacci series less than n
   ...     """Print a Fibonacci series less than n."""
   ...     a, b = 0, 1
   ...     while a < n:
   ...         print(a, end=' ')
   ...         a, b = b, a+b
   ...     print()
   ...
   >>> # Now call the function we just defined:
   >>> fib(2000)
   0 1 1 2 3 5 8 13 21 34 55 89 144 233 377 610 987 1597

.. index::
   single: documentation strings
   single: docstrings
   single: strings, documentation

The keyword :keyword:`def` introduces a function *definition*.  It must be
followed by the function name and the parenthesized list of formal parameters.
The statements that form the body of the function start at the next line, and
must be indented.

The first statement of the function body can optionally be a string literal;
this string literal is the function's documentation string, or :dfn:`docstring`.
(More about docstrings can be found in the section :ref:`tut-docstrings`.)
There are tools which use docstrings to automatically produce online or printed
documentation, or to let the user interactively browse through code; it's good
practice to include docstrings in code that you write, so make a habit of it.

The *execution* of a function introduces a new symbol table used for the local
variables of the function.  More precisely, all variable assignments in a
function store the value in the local symbol table; whereas variable references
first look in the local symbol table, then in the local symbol tables of
enclosing functions, then in the global symbol table, and finally in the table
of built-in names. Thus, global variables and variables of enclosing functions
cannot be directly assigned a value within a function (unless, for global
variables, named in a :keyword:`global` statement, or, for variables of enclosing
functions, named in a :keyword:`nonlocal` statement), although they may be
referenced.

The actual parameters (arguments) to a function call are introduced in the local
symbol table of the called function when it is called; thus, arguments are
passed using *call by value* (where the *value* is always an object *reference*,
not the value of the object). [#]_ When a function calls another function,
or calls itself recursively, a new
local symbol table is created for that call.

A function definition associates the function name with the function object in
the current symbol table.  The interpreter recognizes the object pointed to by
that name as a user-defined function.  Other names can also point to that same
function object and can also be used to access the function::

   >>> fib
   <function fib at 10042ed0>
   >>> f = fib
   >>> f(100)
   0 1 1 2 3 5 8 13 21 34 55 89

Coming from other languages, you might object that ``fib`` is not a function but
a procedure since it doesn't return a value.  In fact, even functions without a
:keyword:`return` statement do return a value, albeit a rather boring one.  This
value is called ``None`` (it's a built-in name).  Writing the value ``None`` is
normally suppressed by the interpreter if it would be the only value written.
You can see it if you really want to using :func:`print`::

   >>> fib(0)
   >>> print(fib(0))
   None

It is simple to write a function that returns a list of the numbers of the
Fibonacci series, instead of printing it::

   >>> def fib2(n):  # return Fibonacci series up to n
   ...     """Return a list containing the Fibonacci series up to n."""
   ...     result = []
   ...     a, b = 0, 1
   ...     while a < n:
   ...         result.append(a)    # see below
   ...         a, b = b, a+b
   ...     return result
   ...
   >>> f100 = fib2(100)    # call it
   >>> f100                # write the result
   [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]

This example, as usual, demonstrates some new Python features:

* The :keyword:`return` statement returns with a value from a function.
  :keyword:`!return` without an expression argument returns ``None``. Falling off
  the end of a function also returns ``None``.

* The statement ``result.append(a)`` calls a *method* of the list object
  ``result``.  A method is a function that 'belongs' to an object and is named
  ``obj.methodname``, where ``obj`` is some object (this may be an expression),
  and ``methodname`` is the name of a method that is defined by the object's type.
  Different types define different methods.  Methods of different types may have
  the same name without causing ambiguity.  (It is possible to define your own
  object types and methods, using *classes*, see :ref:`tut-classes`)
  The method :meth:`~list.append` shown in the example is defined for list objects; it
  adds a new element at the end of the list.  In this example it is equivalent to
  ``result = result + [a]``, but more efficient.

.. _tut-defining:

More on Defining Functions
==========================

It is also possible to define functions with a variable number of arguments.
There are three forms, which can be combined.

.. _tut-defaultargs:

Default Argument Values
-----------------------

The most useful form is to specify a default value for one or more arguments.
This creates a function that can be called with fewer arguments than it is
defined to allow.  For example::

   def ask_ok(prompt, retries=4, reminder='Please try again!'):
       while True:
           reply = input(prompt)
           if reply in {'y', 'ye', 'yes'}:
               return True
           if reply in {'n', 'no', 'nop', 'nope'}:
               return False
           retries = retries - 1
           if retries < 0:
               raise ValueError('invalid user response')
           print(reminder)

This function can be called in several ways:

* giving only the mandatory argument:
  ``ask_ok('Do you really want to quit?')``
* giving one of the optional arguments:
  ``ask_ok('OK to overwrite the file?', 2)``
* or even giving all arguments:
  ``ask_ok('OK to overwrite the file?', 2, 'Come on, only yes or no!')``

This example also introduces the :keyword:`in` keyword. This tests whether or
not a sequence contains a certain value.

The default values are evaluated at the point of function definition in the
*defining* scope, so that ::

   i = 5

   def f(arg=i):
       print(arg)

   i = 6
   f()

will print ``5``.

**Important warning:**  The default value is evaluated only once. This makes a
difference when the default is a mutable object such as a list, dictionary, or
instances of most classes.  For example, the following function accumulates the
arguments passed to it on subsequent calls::

   def f(a, L=[]):
       L.append(a)
       return L

   print(f(1))
   print(f(2))
   print(f(3))

This will print ::

   [1]
   [1, 2]
   [1, 2, 3]

If you don't want the default to be shared between subsequent calls, you can
write the function like this instead::

   def f(a, L=None):
       if L is None:
           L = []
       L.append(a)
       return L

.. _tut-keywordargs:

Keyword Arguments
-----------------

Functions can also be called using :term:`keyword arguments <keyword argument>`
of the form ``kwarg=value``.  For instance, the following function::

   def parrot(voltage, state='a stiff', action='voom', type='Norwegian Blue'):
       print("-- This parrot wouldn't", action, end=' ')
       print("if you put", voltage, "volts through it.")
       print("-- Lovely plumage, the", type)
       print("-- It's", state, "!")

accepts one required argument (``voltage``) and three optional arguments
(``state``, ``action``, and ``type``).  This function can be called in any
of the following ways::

   parrot(1000)                                          # 1 positional argument
   parrot(voltage=1000)                                  # 1 keyword argument
   parrot(voltage=1000000, action='VOOOOOM')             # 2 keyword arguments
   parrot(action='VOOOOOM', voltage=1000000)             # 2 keyword arguments
   parrot('a million', 'bereft of life', 'jump')         # 3 positional arguments
   parrot('a thousand', state='pushing up the daisies')  # 1 positional, 1 keyword

but all the following calls would be invalid::

   parrot()                     # required argument missing
   parrot(voltage=5.0, 'dead')  # non-keyword argument after a keyword argument
   parrot(110, voltage=220)     # duplicate value for the same argument
   parrot(actor='John Cleese')  # unknown keyword argument

In a function call, keyword arguments must follow positional arguments.
All the keyword arguments passed must match one of the arguments
accepted by the function (e.g. ``actor`` is not a valid argument for the
``parrot`` function), and their order is not important.  This also includes
non-optional arguments (e.g. ``parrot(voltage=1000)`` is valid too).
No argument may receive a value more than once.
Here's an example that fails due to this restriction::

   >>> def function(a):
   ...     pass
   ...
   >>> function(0, a=0)
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   TypeError: function() got multiple values for argument 'a'

When a final formal parameter of the form ``**name`` is present, it receives a
dictionary (see :ref:`typesmapping`) containing all keyword arguments except for
those corresponding to a formal parameter.  This may be combined with a formal
parameter of the form ``*name`` (described in the next subsection) which
receives a :ref:`tuple <tut-tuples>` containing the positional
arguments beyond the formal parameter list.  (``*name`` must occur
before ``**name``.) For example, if we define a function like this::

   def cheeseshop(kind, *arguments, **keywords):
       print("-- Do you have any", kind, "?")
       print("-- I'm sorry, we're all out of", kind)
       for arg in arguments:
           print(arg)
       print("-" * 40)
       for kw in keywords:
           print(kw, ":", keywords[kw])

It could be called like this::

   cheeseshop("Limburger", "It's very runny, sir.",
              "It's really very, VERY runny, sir.",
              shopkeeper="Michael Palin",
              client="John Cleese",
              sketch="Cheese Shop Sketch")

and of course it would print:

.. code-block:: none

   -- Do you have any Limburger ?
   -- I'm sorry, we're all out of Limburger
   It's very runny, sir.
   It's really very, VERY runny, sir.
   ----------------------------------------
   shopkeeper : Michael Palin
   client : John Cleese
   sketch : Cheese Shop Sketch

Note that the order in which the keyword arguments are printed is guaranteed
to match the order in which they were provided in the function call.

Special parameters
------------------

By default, arguments may be passed to a Python function either by position
or explicitly by keyword. For readability and performance, it makes sense to
restrict the way arguments can be passed so that a developer need only look
at the function definition to determine if items are passed by position, by
position or keyword, or by keyword.

A function definition may look like:

.. code-block:: none

   def f(pos1, pos2, /, pos_or_kwd, *, kwd1, kwd2):
         -----------    ----------     ----------
           |             |                  |
           |        Positional or keyword   |
           |                                - Keyword only
            -- Positional only

where ``/`` and ``*`` are optional. If used, these symbols indicate the kind of
parameter by how the arguments may be passed to the function:
positional-only, positional-or-keyword, and keyword-only. Keyword parameters
are also referred to as named parameters.

-------------------------------
Positional-or-Keyword Arguments
-------------------------------

If ``/`` and ``*`` are not present in the function definition, arguments may
be passed to a function by position or by keyword.

--------------------------
Positional-Only Parameters
--------------------------

Looking at this in a bit more detail, it is possible to mark certain parameters
as *positional-only*. If *positional-only*, the parameters' order matters, and
the parameters cannot be passed by keyword. Positional-only parameters are
placed before a ``/`` (forward-slash). The ``/`` is used to logically
separate the positional-only parameters from the rest of the parameters.
If there is no ``/`` in the function definition, there are no positional-only
parameters.

Parameters following the ``/`` may be *positional-or-keyword* or *keyword-only*.

----------------------
Keyword-Only Arguments
----------------------

To mark parameters as *keyword-only*, indicating the parameters must be passed
by keyword argument, place an ``*`` in the arguments list just before the first
*keyword-only* parameter.

-----------------
Function Examples
-----------------

Consider the following example function definitions paying close attention to the
markers ``/`` and ``*``::

   >>> def standard_arg(arg):
   ...     print(arg)
   ...
   >>> def pos_only_arg(arg, /):
   ...     print(arg)
   ...
   >>> def kwd_only_arg(*, arg):
   ...     print(arg)
   ...
   >>> def combined_example(pos_only, /, standard, *, kwd_only):
   ...     print(pos_only, standard, kwd_only)

The first function definition, ``standard_arg``, the most familiar form,
places no restrictions on the calling convention and arguments may be
passed by position or keyword::

   >>> standard_arg(2)
   2

   >>> standard_arg(arg=2)
   2

The second function ``pos_only_arg`` is restricted to only use positional
parameters as there is a ``/`` in the function definition::

   >>> pos_only_arg(1)
   1

   >>> pos_only_arg(arg=1)
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   TypeError: pos_only_arg() got some positional-only arguments passed as keyword arguments: 'arg'

The third function ``kwd_only_arg`` only allows keyword arguments as indicated
by a ``*`` in the function definition::

   >>> kwd_only_arg(3)
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   TypeError: kwd_only_arg() takes 0 positional arguments but 1 was given

   >>> kwd_only_arg(arg=3)
   3

And the last uses all three calling conventions in the same function
definition::

   >>> combined_example(1, 2, 3)
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   TypeError: combined_example() takes 2 positional arguments but 3 were given

   >>> combined_example(1, 2, kwd_only=3)
   1 2 3

   >>> combined_example(1, standard=2, kwd_only=3)
   1 2 3

   >>> combined_example(pos_only=1, standard=2, kwd_only=3)
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   TypeError: combined_example() got some positional-only arguments passed as keyword arguments: 'pos_only'

Finally, consider this function definition which has a potential collision between the positional argument ``name``  and ``**kwds`` which has ``name`` as a key::

    def foo(name, **kwds):
        return 'name' in kwds

There is no possible call that will make it return ``True`` as the keyword ``'name'``
will always bind to the first parameter. For example::

    >>> foo(1, **{'name': 2})
    Traceback (most recent call last):
      File "<stdin>", line 1, in <module>
    TypeError: foo() got multiple values for argument 'name'
    >>>

But using ``/`` (positional only arguments), it is possible since it allows ``name`` as a positional argument and ``'name'`` as a key in the keyword arguments::

    >>> def foo(name, /, **kwds):
    ...     return 'name' in kwds
    ...
    >>> foo(1, **{'name': 2})
    True

In other words, the names of positional-only parameters can be used in
``**kwds`` without ambiguity.

-----
Recap
-----

The use case will determine which parameters to use in the function definition::

   def f(pos1, pos2, /, pos_or_kwd, *, kwd1, kwd2):

As guidance:

* Use positional-only if you want the name of the parameters to not be
  available to the user. This is useful when parameter names have no real
  meaning, if you want to enforce the order of the arguments when the function
  is called or if you need to take some positional parameters and arbitrary
  keywords.
* Use keyword-only when names have meaning and the function definition is
  more understandable by being explicit with names or you want to prevent
  users relying on the position of the argument being passed.
* For an API, use positional-only to prevent breaking API changes
  if the parameter's name is modified in the future.

.. _tut-arbitraryargs:

Arbitrary Argument Lists
------------------------

.. index::
   single: * (asterisk); in function calls

Finally, the least frequently used option is to specify that a function can be
called with an arbitrary number of arguments.  These arguments will be wrapped
up in a tuple (see :ref:`tut-tuples`).  Before the variable number of arguments,
zero or more normal arguments may occur. ::

   def write_multiple_items(file, separator, *args):
       file.write(separator.join(args))

Normally, these *variadic* arguments will be last in the list of formal
parameters, because they scoop up all remaining input arguments that are
passed to the function. Any formal parameters which occur after the ``*args``
parameter are 'keyword-only' arguments, meaning that they can only be used as
keywords rather than positional arguments. ::

   >>> def concat(*args, sep="/"):
   ...     return sep.join(args)
   ...
   >>> concat("earth", "mars", "venus")
   'earth/mars/venus'
   >>> concat("earth", "mars", "venus", sep=".")
   'earth.mars.venus'

.. _tut-unpacking-arguments:

Unpacking Argument Lists
------------------------

The reverse situation occurs when the arguments are already in a list or tuple
but need to be unpacked for a function call requiring separate positional
arguments.  For instance, the built-in :func:`range` function expects separate
*start* and *stop* arguments.  If they are not available separately, write the
function call with the  ``*``\ -operator to unpack the arguments out of a list
or tuple::

   >>> list(range(3, 6))            # normal call with separate arguments
   [3, 4, 5]
   >>> args = [3, 6]
   >>> list(range(*args))            # call with arguments unpacked from a list
   [3, 4, 5]

.. index::
   single: **; in function calls

In the same fashion, dictionaries can deliver keyword arguments with the
``**``\ -operator::

   >>> def parrot(voltage, state='a stiff', action='voom'):
   ...     print("-- This parrot wouldn't", action, end=' ')
   ...     print("if you put", voltage, "volts through it.", end=' ')
   ...     print("E's", state, "!")
   ...
   >>> d = {"voltage": "four million", "state": "bleedin' demised", "action": "VOOM"}
   >>> parrot(**d)
   -- This parrot wouldn't VOOM if you put four million volts through it. E's bleedin' demised !

.. _tut-lambda:

Lambda Expressions
------------------

Small anonymous functions can be created with the :keyword:`lambda` keyword.
This function returns the sum of its two arguments: ``lambda a, b: a+b``.
Lambda functions can be used wherever function objects are required.  They are
syntactically restricted to a single expression.  Semantically, they are just
syntactic sugar for a normal function definition.  Like nested function
definitions, lambda functions can reference variables from the containing
scope::

   >>> def make_incrementor(n):
   ...     return lambda x: x + n
   ...
   >>> f = make_incrementor(42)
   >>> f(0)
   42
   >>> f(1)
   43

The above example uses a lambda expression to return a function.  Another use
is to pass a small function as an argument.  For instance, :meth:`list.sort`
takes a sorting key function *key* which can be a lambda function::

   >>> pairs = [(1, 'one'), (2, 'two'), (3, 'three'), (4, 'four')]
   >>> pairs.sort(key=lambda pair: pair[1])
   >>> pairs
   [(4, 'four'), (1, 'one'), (3, 'three'), (2, 'two')]

.. _tut-docstrings:

Documentation Strings
---------------------

.. index::
   single: docstrings
   single: documentation strings
   single: strings, documentation

Here are some conventions about the content and formatting of documentation
strings.

The first line should always be a short, concise summary of the object's
purpose.  For brevity, it should not explicitly state the object's name or type,
since these are available by other means (except if the name happens to be a
verb describing a function's operation).  This line should begin with a capital
letter and end with a period.

If there are more lines in the documentation string, the second line should be
blank, visually separating the summary from the rest of the description.  The
following lines should be one or more paragraphs describing the object's calling
conventions, its side effects, etc.

The Python parser strips indentation from multi-line string literals when they
serve as module, class, or function docstrings.

Here is an example of a multi-line docstring::

   >>> def my_function():
   ...     """Do nothing, but document it.
   ...
   ...     No, really, it doesn't do anything:
   ...
   ...         >>> my_function()
   ...         >>>
   ...     """
   ...     pass
   ...
   >>> print(my_function.__doc__)
   Do nothing, but document it.

   No, really, it doesn't do anything:

       >>> my_function()
       >>>

.. _tut-annotations:

Function Annotations
--------------------

.. index::
   pair: function; annotations
   single: ->; function annotations
   single: : (colon); function annotations

:ref:`Function annotations <function>` are completely optional metadata
information about the types used by user-defined functions (see :pep:`3107` and
:pep:`484` for more information).

:term:`Annotations <function annotation>` are stored in the :attr:`~object.__annotations__`
attribute of the function as a dictionary and have no effect on any other part of the
function.  Parameter annotations are defined by a colon after the parameter name, followed
by an expression evaluating to the value of the annotation.  Return annotations are
defined by a literal ``->``, followed by an expression, between the parameter
list and the colon denoting the end of the :keyword:`def` statement.  The
following example has a required argument, an optional argument, and the return
value annotated::

   >>> def f(ham: str, eggs: str = 'eggs') -> str:
   ...     print("Annotations:", f.__annotations__)
   ...     print("Arguments:", ham, eggs)
   ...     return ham + ' and ' + eggs
   ...
   >>> f('spam')
   Annotations: {'ham': <class 'str'>, 'return': <class 'str'>, 'eggs': <class 'str'>}
   Arguments: spam eggs
   'spam and eggs'

.. _tut-codingstyle:

Intermezzo: Coding Style
========================

.. index:: pair: coding; style

Now that you are about to write longer, more complex pieces of Python, it is a
good time to talk about *coding style*.  Most languages can be written (or more
concisely, *formatted*) in different styles; some are more readable than others.
Making it easy for others to read your code is always a good idea, and adopting
a nice coding style helps tremendously for that.

For Python, :pep:`8` has emerged as the style guide that most projects adhere to;
it promotes a very readable and eye-pleasing coding style.  Every Python
developer should read it at some point; here are the most important points
extracted for you:

* Use 4-space indentation, and no tabs.

  4 spaces are a good compromise between small indentation (allows greater
  nesting depth) and large indentation (easier to read).  Tabs introduce
  confusion, and are best left out.

* Wrap lines so that they don't exceed 79 characters.

  This helps users with small displays and makes it possible to have several
  code files side-by-side on larger displays.

* Use blank lines to separate functions and classes, and larger blocks of
  code inside functions.

* When possible, put comments on a line of their own.

* Use docstrings.

* Use spaces around operators and after commas, but not directly inside
  bracketing constructs: ``a = f(1, 2) + g(3, 4)``.

* Name your classes and functions consistently; the convention is to use
  ``UpperCamelCase`` for classes and ``lowercase_with_underscores`` for functions
  and methods.  Always use ``self`` as the name for the first method argument
  (see :ref:`tut-firstclasses` for more on classes and methods).

* Don't use fancy encodings if your code is meant to be used in international
  environments.  Python's default, UTF-8, or even plain ASCII work best in any
  case.

* Likewise, don't use non-ASCII characters in identifiers if there is only the
  slightest chance people speaking a different language will read or maintain
  the code.

.. rubric:: Footnotes

.. [#] Actually, *call by object reference* would be a better description,
   since if a mutable object is passed, the caller will see any changes the
   callee makes to it (items inserted into a list).

.. _tut-structures:

***************
Data Structures
***************

This chapter describes some things you've learned about already in more detail,
and adds some new things as well.

.. _tut-morelists:

More on Lists
=============

The :ref:`list <typesseq-list>` data type has some more methods. Here are all
of the methods of list objects:

.. method:: list.append(value, /)
   :noindex:

   Add an item to the end of the list.  Similar to ``a[len(a):] = [x]``.

.. method:: list.extend(iterable, /)
   :noindex:

   Extend the list by appending all the items from the iterable.  Similar to
   ``a[len(a):] = iterable``.

.. method:: list.insert(index, value, /)
   :noindex:

   Insert an item at a given position.  The first argument is the index of the
   element before which to insert, so ``a.insert(0, x)`` inserts at the front of
   the list, and ``a.insert(len(a), x)`` is equivalent to ``a.append(x)``.

.. method:: list.remove(value, /)
   :noindex:

   Remove the first item from the list whose value is equal to *value*.  It raises a
   :exc:`ValueError` if there is no such item.

.. method:: list.pop(index=-1, /)
   :noindex:

   Remove the item at the given position in the list, and return it.  If no index
   is specified, ``a.pop()`` removes and returns the last item in the list.
   It raises an :exc:`IndexError` if the list is empty or the index is
   outside the list range.

.. method:: list.clear()
   :noindex:

   Remove all items from the list.  Similar to ``del a[:]``.

.. method:: list.index(value[, start[, stop]])
   :noindex:

   Return zero-based index of the first occurrence of *value* in the list.
   Raises a :exc:`ValueError` if there is no such item.

   The optional arguments *start* and *end* are interpreted as in the slice
   notation and are used to limit the search to a particular subsequence of
   the list.  The returned index is computed relative to the beginning of the full
   sequence rather than the *start* argument.

.. method:: list.count(value, /)
   :noindex:

   Return the number of times *value* appears in the list.

.. method:: list.sort(*, key=None, reverse=False)
   :noindex:

   Sort the items of the list in place (the arguments can be used for sort
   customization, see :func:`sorted` for their explanation).

.. method:: list.reverse()
   :noindex:

   Reverse the elements of the list in place.

.. method:: list.copy()
   :noindex:

   Return a shallow copy of the list.  Similar to ``a[:]``.

An example that uses most of the list methods::

    >>> fruits = ['orange', 'apple', 'pear', 'banana', 'kiwi', 'apple', 'banana']
    >>> fruits.count('apple')
    2
    >>> fruits.count('tangerine')
    0
    >>> fruits.index('banana')
    3
    >>> fruits.index('banana', 4)  # Find next banana starting at position 4
    6
    >>> fruits.reverse()
    >>> fruits
    ['banana', 'apple', 'kiwi', 'banana', 'pear', 'apple', 'orange']
    >>> fruits.append('grape')
    >>> fruits
    ['banana', 'apple', 'kiwi', 'banana', 'pear', 'apple', 'orange', 'grape']
    >>> fruits.sort()
    >>> fruits
    ['apple', 'apple', 'banana', 'banana', 'grape', 'kiwi', 'orange', 'pear']
    >>> fruits.pop()
    'pear'

You might have noticed that methods like ``insert``, ``remove`` or ``sort`` that
only modify the list have no return value printed -- they return the default
``None``. [#]_  This is a design principle for all mutable data structures in
Python.

Another thing you might notice is that not all data can be sorted or
compared.  For instance, ``[None, 'hello', 10]`` doesn't sort because
integers can't be compared to strings and ``None`` can't be compared to
other types.  Also, there are some types that don't have a defined
ordering relation.  For example, ``3+4j < 5+7j`` isn't a valid
comparison.

.. _tut-lists-as-stacks:

Using Lists as Stacks
---------------------

The list methods make it very easy to use a list as a stack, where the last
element added is the first element retrieved ("last-in, first-out").  To add an
item to the top of the stack, use :meth:`~list.append`.  To retrieve an item from the
top of the stack, use :meth:`~list.pop` without an explicit index.  For example::

   >>> stack = [3, 4, 5]
   >>> stack.append(6)
   >>> stack.append(7)
   >>> stack
   [3, 4, 5, 6, 7]
   >>> stack.pop()
   7
   >>> stack
   [3, 4, 5, 6]
   >>> stack.pop()
   6
   >>> stack.pop()
   5
   >>> stack
   [3, 4]

.. _tut-lists-as-queues:

Using Lists as Queues
---------------------

It is also possible to use a list as a queue, where the first element added is
the first element retrieved ("first-in, first-out"); however, lists are not
efficient for this purpose.  While appends and pops from the end of list are
fast, doing inserts or pops from the beginning of a list is slow (because all
of the other elements have to be shifted by one).  See
:ref:`time-complexity` for more information.

To implement a queue, use :class:`collections.deque` which was designed to
have fast appends and pops from both ends.  For example::

   >>> from collections import deque
   >>> queue = deque(["Eric", "John", "Michael"])
   >>> queue.append("Terry")           # Terry arrives
   >>> queue.append("Graham")          # Graham arrives
   >>> queue.popleft()                 # The first to arrive now leaves
   'Eric'
   >>> queue.popleft()                 # The second to arrive now leaves
   'John'
   >>> queue                           # Remaining queue in order of arrival
   deque(['Michael', 'Terry', 'Graham'])

.. _tut-listcomps:

List Comprehensions
-------------------

List comprehensions provide a concise way to create lists.
Common applications are to make new lists where each element is the result of
some operations applied to each member of another sequence or iterable, or to
create a subsequence of those elements that satisfy a certain condition.

For example, assume we want to create a list of squares, like::

   >>> squares = []
   >>> for x in range(10):
   ...     squares.append(x**2)
   ...
   >>> squares
   [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]

Note that this creates (or overwrites) a variable named ``x`` that still exists
after the loop completes.  We can calculate the list of squares without any
side effects using::

   squares = list(map(lambda x: x**2, range(10)))

or, equivalently::

   squares = [x**2 for x in range(10)]

which is more concise and readable.

A list comprehension consists of brackets containing an expression followed
by a :keyword:`!for` clause, then zero or more :keyword:`!for` or :keyword:`!if`
clauses.  The result will be a new list resulting from evaluating the expression
in the context of the :keyword:`!for` and :keyword:`!if` clauses which follow it.
For example, this listcomp combines the elements of two lists if they are not
equal::

   >>> [(x, y) for x in [1,2,3] for y in [3,1,4] if x != y]
   [(1, 3), (1, 4), (2, 3), (2, 1), (2, 4), (3, 1), (3, 4)]

and it's equivalent to::

   >>> combs = []
   >>> for x in [1,2,3]:
   ...     for y in [3,1,4]:
   ...         if x != y:
   ...             combs.append((x, y))
   ...
   >>> combs
   [(1, 3), (1, 4), (2, 3), (2, 1), (2, 4), (3, 1), (3, 4)]

Note how the order of the :keyword:`for` and :keyword:`if` statements is the
same in both these snippets.

If the expression is a tuple (e.g. the ``(x, y)`` in the previous example),
it must be parenthesized. ::

   >>> vec = [-4, -2, 0, 2, 4]
   >>> # create a new list with the values doubled
   >>> [x*2 for x in vec]
   [-8, -4, 0, 4, 8]
   >>> # filter the list to exclude negative numbers
   >>> [x for x in vec if x >= 0]
   [0, 2, 4]
   >>> # apply a function to all the elements
   >>> [abs(x) for x in vec]
   [4, 2, 0, 2, 4]
   >>> # call a method on each element
   >>> freshfruit = ['  banana', '  loganberry ', 'passion fruit  ']
   >>> [weapon.strip() for weapon in freshfruit]
   ['banana', 'loganberry', 'passion fruit']
   >>> # create a list of 2-tuples like (number, square)
   >>> [(x, x**2) for x in range(6)]
   [(0, 0), (1, 1), (2, 4), (3, 9), (4, 16), (5, 25)]
   >>> # the tuple must be parenthesized, otherwise an error is raised
   >>> [x, x**2 for x in range(6)]
     File "<stdin>", line 1
       [x, x**2 for x in range(6)]
        ^^^^^^^
   SyntaxError: did you forget parentheses around the comprehension target?
   >>> # flatten a list using a listcomp with two 'for'
   >>> vec = [[1,2,3], [4,5,6], [7,8,9]]
   >>> [num for elem in vec for num in elem]
   [1, 2, 3, 4, 5, 6, 7, 8, 9]

List comprehensions can contain complex expressions and nested functions::

   >>> from math import pi
   >>> [str(round(pi, i)) for i in range(1, 6)]
   ['3.1', '3.14', '3.142', '3.1416', '3.14159']

Nested List Comprehensions
--------------------------

The initial expression in a list comprehension can be any arbitrary expression,
including another list comprehension.

Consider the following example of a 3x4 matrix implemented as a list of
3 lists of length 4::

   >>> matrix = [
   ...     [1, 2, 3, 4],
   ...     [5, 6, 7, 8],
   ...     [9, 10, 11, 12],
   ... ]

The following list comprehension will transpose rows and columns::

   >>> [[row[i] for row in matrix] for i in range(4)]
   [[1, 5, 9], [2, 6, 10], [3, 7, 11], [4, 8, 12]]

As we saw in the previous section, the inner list comprehension is evaluated in
the context of the :keyword:`for` that follows it, so this example is
equivalent to::

   >>> transposed = []
   >>> for i in range(4):
   ...     transposed.append([row[i] for row in matrix])
   ...
   >>> transposed
   [[1, 5, 9], [2, 6, 10], [3, 7, 11], [4, 8, 12]]

which, in turn, is the same as::

   >>> transposed = []
   >>> for i in range(4):
   ...     # the following 3 lines implement the nested listcomp
   ...     transposed_row = []
   ...     for row in matrix:
   ...         transposed_row.append(row[i])
   ...     transposed.append(transposed_row)
   ...
   >>> transposed
   [[1, 5, 9], [2, 6, 10], [3, 7, 11], [4, 8, 12]]

In the real world, you should prefer built-in functions to complex flow statements.
The :func:`zip` function would do a great job for this use case::

   >>> list(zip(*matrix))
   [(1, 5, 9), (2, 6, 10), (3, 7, 11), (4, 8, 12)]

See :ref:`tut-unpacking-arguments` for details on the asterisk in this line.

Unpacking in Lists and List Comprehensions
------------------------------------------

The section on :ref:`tut-unpacking-arguments` describes the use of ``*`` to
"unpack" the elements of an iterable object, providing each one separately as
an argument to a function.  Unpacking can also be used in other contexts, for
example, when creating lists.  When specifying elements of a list, prefixing an
expression by a ``*`` will unpack the result of that expression, adding each of
its elements to the list we're creating::

   >>> x = [1, 2, 3]
   >>> [0, *x, 4, 5, 6]
   [0, 1, 2, 3, 4, 5, 6]

This only works if the expression following the ``*`` evaluates to an iterable
object; trying to unpack a non-iterable object will raise an exception::

   >>> x = 1
   >>> [0, *x, 2, 3, 4]
   Traceback (most recent call last):
     File "<python-input-1>", line 1, in <module>
       [0, *x, 2, 3, 4]
   TypeError: Value after * must be an iterable, not int

Unpacking can also be used in list comprehensions, as a way to build a new list
representing the concatenation of an arbitrary number of iterables::

   >>> x = [[1, 2, 3], [4, 5, 6], [], [7], [8, 9]]
   >>> [*element for element in x]
   [1, 2, 3, 4, 5, 6, 7, 8, 9]

Note that the effect is that each element from ``x`` is unpacked.  This works
for arbitrary iterable objects, not just lists::

   >>> x = [[1, 2, 3], 'cat', {'spam': 'eggs'}]
   >>> [*element for element in x]
   [1, 2, 3, 'c', 'a', 't', 'spam']

But if the objects in ``x`` are not iterable, this expression would again raise
an exception.

.. _tut-del:

The :keyword:`!del` statement
=============================

There is a way to remove an item from a list given its index instead of its
value: the :keyword:`del` statement.  This differs from the :meth:`~list.pop` method
which returns a value.  The :keyword:`!del` statement can also be used to remove
slices from a list or clear the entire list (which we did earlier by assignment
of an empty list to the slice).  For example::

   >>> a = [-1, 1, 66.25, 333, 333, 1234.5]
   >>> del a[0]
   >>> a
   [1, 66.25, 333, 333, 1234.5]
   >>> del a[2:4]
   >>> a
   [1, 66.25, 1234.5]
   >>> del a[:]
   >>> a
   []

:keyword:`del` can also be used to delete entire variables::

   >>> del a

Referencing the name ``a`` hereafter is an error (at least until another value
is assigned to it).  We'll find other uses for :keyword:`del` later.

.. _tut-tuples:

Tuples and Sequences
====================

We saw that lists and strings have many common properties, such as indexing and
slicing operations.  They are two examples of *sequence* data types (see
:ref:`typesseq`).  Since Python is an evolving language, other sequence data
types may be added.  There is also another standard sequence data type: the
*tuple*.

A tuple consists of a number of values separated by commas, for instance::

   >>> t = 12345, 54321, 'hello!'
   >>> t[0]
   12345
   >>> t
   (12345, 54321, 'hello!')
   >>> # Tuples may be nested:
   >>> u = t, (1, 2, 3, 4, 5)
   >>> u
   ((12345, 54321, 'hello!'), (1, 2, 3, 4, 5))
   >>> # Tuples are immutable:
   >>> t[0] = 88888
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   TypeError: 'tuple' object does not support item assignment
   >>> # but they can contain mutable objects:
   >>> v = ([1, 2, 3], [3, 2, 1])
   >>> v
   ([1, 2, 3], [3, 2, 1])
   >>> # they support unpacking just like lists:
   >>> x = [1, 2, 3]
   >>> 0, *x, 4
   (0, 1, 2, 3, 4)

As you see, on output tuples are always enclosed in parentheses, so that nested
tuples are interpreted correctly; they may be input with or without surrounding
parentheses, although often parentheses are necessary anyway (if the tuple is
part of a larger expression).  It is not possible to assign to the individual
items of a tuple, however it is possible to create tuples which contain mutable
objects, such as lists.

Though tuples may seem similar to lists, they are often used in different
situations and for different purposes.
Tuples are :term:`immutable`, and usually contain a heterogeneous sequence of
elements that are accessed via unpacking (see later in this section) or indexing
(or even by attribute in the case of :func:`namedtuples <collections.namedtuple>`).
Lists are :term:`mutable`, and their elements are usually homogeneous and are
accessed by iterating over the list.

A special problem is the construction of tuples containing 0 or 1 items: the
syntax has some extra quirks to accommodate these.  Empty tuples are constructed
by an empty pair of parentheses; a tuple with one item is constructed by
following a value with a comma (it is not sufficient to enclose a single value
in parentheses). Ugly, but effective.  For example::

   >>> empty = ()
   >>> singleton = 'hello',    # <-- note trailing comma
   >>> len(empty)
   0
   >>> len(singleton)
   1
   >>> singleton
   ('hello',)

The statement ``t = 12345, 54321, 'hello!'`` is an example of *tuple packing*:
the values ``12345``, ``54321`` and ``'hello!'`` are packed together in a tuple.
The reverse operation is also possible::

   >>> x, y, z = t

This is called, appropriately enough, *sequence unpacking* and works for any
sequence on the right-hand side.  Sequence unpacking requires that there are as
many variables on the left side of the equals sign as there are elements in the
sequence.  Note that multiple assignment is really just a combination of tuple
packing and sequence unpacking.

.. _tut-sets:

Sets
====

Python also includes a data type for :ref:`sets <types-set>`.  A set is
an unordered collection with no duplicate elements.  Basic uses include
membership testing and eliminating duplicate entries.  Set objects also
support mathematical operations like union, intersection, difference, and
symmetric difference.

Curly braces or the :func:`set` function can be used to create sets.  Note: to
create an empty set you have to use ``set()``, not ``{}``; the latter creates an
empty dictionary, a data structure that we discuss in the next section.

Because sets are unordered, iterating over them or printing them can
produce the elements in a different order than you expect.

Here is a brief demonstration::

   >>> basket = {'apple', 'orange', 'apple', 'pear', 'orange', 'banana'}
   >>> print(basket)                      # show that duplicates have been removed
   {'orange', 'banana', 'pear', 'apple'}
   >>> 'orange' in basket                 # fast membership testing
   True
   >>> 'crabgrass' in basket
   False

   >>> # Demonstrate set operations on unique letters from two words
   >>>
   >>> a = set('abracadabra')
   >>> b = set('alacazam')
   >>> a                                  # unique letters in a
   {'a', 'r', 'b', 'c', 'd'}
   >>> a - b                              # letters in a but not in b
   {'r', 'd', 'b'}
   >>> a | b                              # letters in a or b or both
   {'a', 'c', 'r', 'd', 'b', 'm', 'z', 'l'}
   >>> a & b                              # letters in both a and b
   {'a', 'c'}
   >>> a ^ b                              # letters in a or b but not both
   {'r', 'd', 'b', 'm', 'z', 'l'}

Similarly to :ref:`list comprehensions <tut-listcomps>`, set comprehensions
are also supported, including comprehensions with unpacking::

   >>> a = {x for x in 'abracadabra' if x not in 'abc'}
   >>> a
   {'r', 'd'}

   >>> fruits = [{'apple', 'avocado', 'apricot'}, {'banana', 'blueberry'}]
   >>> {*fruit for fruit in fruits}
   {'blueberry', 'banana', 'avocado', 'apple', 'apricot'}

.. _tut-dictionaries:

Dictionaries
============

Another useful data type built into Python is the *dictionary* (see
:ref:`typesmapping`). Dictionaries are sometimes found in other languages as
"associative memories" or "associative arrays".  Unlike sequences, which are
indexed by a range of numbers, dictionaries are indexed by *keys*, which can be
any immutable type; strings and numbers can always be keys.  Tuples can be used
as keys if they contain only strings, numbers, or tuples; if a tuple contains
any mutable object either directly or indirectly, it cannot be used as a key.
You can't use lists as keys, since lists can be modified in place using index
assignments, slice assignments, or methods like :meth:`~list.append` and
:meth:`~list.extend`.

It is best to think of a dictionary as a set of *key: value* pairs,
with the requirement that the keys are unique (within one dictionary). A pair of
braces creates an empty dictionary: ``{}``. Placing a comma-separated list of
key:value pairs within the braces adds initial key:value pairs to the
dictionary; this is also the way dictionaries are written on output.

The main operations on a dictionary are storing a value with some key and
extracting the value given the key.  It is also possible to delete a key:value
pair with ``del``. If you store using a key that is already in use, the old
value associated with that key is forgotten.

Extracting a value for a non-existent key by subscripting (``d[key]``) raises a
:exc:`KeyError`. To avoid getting this error when trying to access a possibly
non-existent key, use the :meth:`~dict.get` method instead, which returns
``None`` (or a specified default value) if the key is not in the dictionary.

Performing ``list(d)`` on a dictionary returns a list of all the keys
used in the dictionary, in insertion order (if you want it sorted, just use
``sorted(d)`` instead). To check whether a single key is in the
dictionary, use the :keyword:`in` keyword.

Here is a small example using a dictionary::

   >>> tel = {'jack': 4098, 'sape': 4139}
   >>> tel['guido'] = 4127
   >>> tel
   {'jack': 4098, 'sape': 4139, 'guido': 4127}
   >>> tel['jack']
   4098
   >>> tel['irv']
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   KeyError: 'irv'
   >>> print(tel.get('irv'))
   None
   >>> del tel['sape']
   >>> tel['irv'] = 4127
   >>> tel
   {'jack': 4098, 'guido': 4127, 'irv': 4127}
   >>> list(tel)
   ['jack', 'guido', 'irv']
   >>> sorted(tel)
   ['guido', 'irv', 'jack']
   >>> 'guido' in tel
   True
   >>> 'jack' not in tel
   False

The :func:`dict` constructor builds dictionaries directly from sequences of
key-value pairs::

   >>> dict([('sape', 4139), ('guido', 4127), ('jack', 4098)])
   {'sape': 4139, 'guido': 4127, 'jack': 4098}

In addition, dict comprehensions can be used to create dictionaries from
arbitrary key and value expressions::

   >>> {x: x**2 for x in (2, 4, 6)}
   {2: 4, 4: 16, 6: 36}

And dictionary unpacking (via ``**``) can be used to merge multiple
dictionaries::

   >>> odds = {i: i**2 for i in (1, 3, 5)}
   >>> evens = {i: i**2 for i in (2, 4, 6)}
   >>> {**odds, **evens}
   {1: 1, 3: 9, 5: 25, 2: 4, 4: 16, 6: 36}

   >>> all_values = [odds, evens, {0: 0}]
   >>> {**i for i in all_values}
   {1: 1, 3: 9, 5: 25, 2: 4, 4: 16, 6: 36, 0: 0}

When the keys are simple strings, it is sometimes easier to specify pairs using
keyword arguments::

   >>> dict(sape=4139, guido=4127, jack=4098)
   {'sape': 4139, 'guido': 4127, 'jack': 4098}

.. _tut-loopidioms:

Looping Techniques
==================

When looping through dictionaries, the key and corresponding value can be
retrieved at the same time using the :meth:`~dict.items` method. ::

   >>> knights = {'gallahad': 'the pure', 'robin': 'the brave'}
   >>> for k, v in knights.items():
   ...     print(k, v)
   ...
   gallahad the pure
   robin the brave

When looping through a sequence, the position index and corresponding value can
be retrieved at the same time using the :func:`enumerate` function. ::

   >>> for i, v in enumerate(['tic', 'tac', 'toe']):
   ...     print(i, v)
   ...
   0 tic
   1 tac
   2 toe

To loop over two or more sequences at the same time, the entries can be paired
with the :func:`zip` function. ::

   >>> questions = ['name', 'quest', 'favorite color']
   >>> answers = ['lancelot', 'the holy grail', 'blue']
   >>> for q, a in zip(questions, answers):
   ...     print('What is your {0}?  It is {1}.'.format(q, a))
   ...
   What is your name?  It is lancelot.
   What is your quest?  It is the holy grail.
   What is your favorite color?  It is blue.

To loop over a sequence in reverse, first specify the sequence in a forward
direction and then call the :func:`reversed` function. ::

   >>> for i in reversed(range(1, 10, 2)):
   ...     print(i)
   ...
   9
   7
   5
   3
   1

To loop over a sequence in sorted order, use the :func:`sorted` function which
returns a new sorted list while leaving the source unaltered. ::

   >>> basket = ['apple', 'orange', 'apple', 'pear', 'orange', 'banana']
   >>> for i in sorted(basket):
   ...     print(i)
   ...
   apple
   apple
   banana
   orange
   orange
   pear

Using :func:`set` on a sequence eliminates duplicate elements. The use of
:func:`sorted` in combination with :func:`set` over a sequence is an idiomatic
way to loop over unique elements of the sequence in sorted order. ::

   >>> basket = ['apple', 'orange', 'apple', 'pear', 'orange', 'banana']
   >>> for f in sorted(set(basket)):
   ...     print(f)
   ...
   apple
   banana
   orange
   pear

It is sometimes tempting to change a list while you are looping over it;
however, it is often simpler and safer to create a new list instead. ::

   >>> import math
   >>> raw_data = [56.2, float('NaN'), 51.7, 55.3, 52.5, float('NaN'), 47.8]
   >>> filtered_data = []
   >>> for value in raw_data:
   ...     if not math.isnan(value):
   ...         filtered_data.append(value)
   ...
   >>> filtered_data
   [56.2, 51.7, 55.3, 52.5, 47.8]

.. _tut-conditions:

More on Conditions
==================

The conditions used in ``while`` and ``if`` statements can contain any
operators, not just comparisons.

The comparison operators ``in`` and ``not in`` are membership tests that
determine whether a value is in (or not in) a container.  The operators ``is``
and ``is not`` compare whether two objects are really the same object.  All
comparison operators have the same priority, which is lower than that of all
numerical operators.

Comparisons can be chained.  For example, ``a < b == c`` tests whether ``a`` is
less than ``b`` and moreover ``b`` equals ``c``.

Comparisons may be combined using the Boolean operators ``and`` and ``or``, and
the outcome of a comparison (or of any other Boolean expression) may be negated
with ``not``.  These have lower priorities than comparison operators; between
them, ``not`` has the highest priority and ``or`` the lowest, so that ``A and
not B or C`` is equivalent to ``(A and (not B)) or C``. As always, parentheses
can be used to express the desired composition.

The Boolean operators ``and`` and ``or`` are so-called *short-circuit*
operators: their arguments are evaluated from left to right, and evaluation
stops as soon as the outcome is determined.  For example, if ``A`` and ``C`` are
true but ``B`` is false, ``A and B and C`` does not evaluate the expression
``C``.  When used as a general value and not as a Boolean, the return value of a
short-circuit operator is the last evaluated argument.

It is possible to assign the result of a comparison or other Boolean expression
to a variable.  For example, ::

   >>> string1, string2, string3 = '', 'Trondheim', 'Hammer Dance'
   >>> non_null = string1 or string2 or string3
   >>> non_null
   'Trondheim'

Note that in Python, unlike C, assignment inside expressions must be done
explicitly with the
:ref:`walrus operator <why-can-t-i-use-an-assignment-in-an-expression>` ``:=``.
This avoids a common class of problems encountered in C programs: typing ``=``
in an expression when ``==`` was intended.

.. _tut-comparing:

Comparing Sequences and Other Types
===================================
Sequence objects typically may be compared to other objects with the same sequence
type. The comparison uses *lexicographical* ordering: first the first two
items are compared, and if they differ this determines the outcome of the
comparison; if they are equal, the next two items are compared, and so on, until
either sequence is exhausted. If two items to be compared are themselves
sequences of the same type, the lexicographical comparison is carried out
recursively.  If all items of two sequences compare equal, the sequences are
considered equal. If one sequence is an initial sub-sequence of the other, the
shorter sequence is the smaller (lesser) one.  Lexicographical ordering for
strings uses the Unicode code point number to order individual characters.
Some examples of comparisons between sequences of the same type::

   (1, 2, 3)              < (1, 2, 4)
   [1, 2, 3]              < [1, 2, 4]
   'ABC' < 'C' < 'Pascal' < 'Python'
   (1, 2, 3, 4)           < (1, 2, 4)
   (1, 2)                 < (1, 2, -1)
   (1, 2, 3)             == (1.0, 2.0, 3.0)
   (1, 2, ('aa', 'ab'))   < (1, 2, ('abc', 'a'), 4)

Note that comparing objects of different types with ``<`` or ``>`` is legal
provided that the objects have appropriate comparison methods.  For example,
mixed numeric types are compared according to their numeric value, so 0 equals
0.0, etc.  Otherwise, rather than providing an arbitrary ordering, the
interpreter will raise a :exc:`TypeError` exception.

.. rubric:: Footnotes

.. [#] Other languages may return the mutated object, which allows method
       chaining, such as ``d->insert("a")->remove("b")->sort();``.

.. _tut-io:

****************
Input and output
****************

There are several ways to present the output of a program; data can be printed
in a human-readable form, or written to a file for future use. This chapter will
discuss some of the possibilities.

.. _tut-formatting:

Fancier output formatting
=========================

So far we've encountered two ways of writing values: *expression statements* and
the :func:`print` function.  (A third way is using the :meth:`~io.TextIOBase.write` method
of file objects; the standard output file can be referenced as ``sys.stdout``.
See the Library Reference for more information on this.)

Often you'll want more control over the formatting of your output than simply
printing space-separated values. There are several ways to format output.

* To use :ref:`formatted string literals <tut-f-strings>`, begin a string
  with ``f`` or ``F`` before the opening quotation mark or triple quotation mark.
  Inside this string, you can write a Python expression between ``{`` and ``}``
  characters that can refer to variables or literal values.

  ::

     >>> year = 2016
     >>> event = 'Referendum'
     >>> f'Results of the {year} {event}'
     'Results of the 2016 Referendum'

* The :meth:`str.format` method of strings requires more manual
  effort.  You'll still use ``{`` and ``}`` to mark where a variable
  will be substituted and can provide detailed formatting directives,
  but you'll also need to provide the information to be formatted. In the following code
  block there are two examples of how to format variables:

  ::

     >>> yes_votes = 42_572_654
     >>> total_votes = 85_705_149
     >>> percentage = yes_votes / total_votes
     >>> '{:-9} YES votes  {:2.2%}'.format(yes_votes, percentage)
     ' 42572654 YES votes  49.67%'

  Notice how the ``yes_votes`` are padded with spaces and a negative sign only for negative numbers.
  The example also prints ``percentage`` multiplied by 100, with 2 decimal
  places and followed by a percent sign (see :ref:`formatspec` for details).

* Finally, you can do all the string handling yourself by using string slicing and
  concatenation operations to create any layout you can imagine.  The
  string type has some methods that perform useful operations for padding
  strings to a given column width.

When you don't need fancy output but just want a quick display of some
variables for debugging purposes, you can convert any value to a string with
the :func:`repr` or :func:`str` functions.

The :func:`str` function is meant to return representations of values which are
fairly human-readable, while :func:`repr` is meant to generate representations
which can be read by the interpreter (or will force a :exc:`SyntaxError` if
there is no equivalent syntax).  For objects which don't have a particular
representation for human consumption, :func:`str` will return the same value as
:func:`repr`.  Many values, such as numbers or structures like lists and
dictionaries, have the same representation using either function.  Strings, in
particular, have two distinct representations.

Some examples::

   >>> s = 'Hello, world.'
   >>> str(s)
   'Hello, world.'
   >>> repr(s)
   "'Hello, world.'"
   >>> str(1/7)
   '0.14285714285714285'
   >>> x = 10 * 3.25
   >>> y = 200 * 200
   >>> s = 'The value of x is ' + repr(x) + ', and y is ' + repr(y) + '...'
   >>> print(s)
   The value of x is 32.5, and y is 40000...
   >>> # The repr() of a string adds string quotes and backslashes:
   >>> hello = 'hello, world\n'
   >>> hellos = repr(hello)
   >>> print(hellos)
   'hello, world\n'
   >>> # The argument to repr() may be any Python object:
   >>> repr((x, y, ('spam', 'eggs')))
   "(32.5, 40000, ('spam', 'eggs'))"

The :mod:`string` module contains support for a simple templating approach
based upon regular expressions, via :class:`string.Template`.
This offers yet another way to substitute values into strings,
using placeholders like ``$x`` and replacing them with values from a dictionary.
This syntax is easy to use, although it offers much less control for formatting.

.. index::
   single: formatted string literal
   single: interpolated string literal
   single: string; formatted literal
   single: string; interpolated literal
   single: f-string
   single: fstring

.. _tut-f-strings:

Formatted string literals
-------------------------

:ref:`Formatted string literals <f-strings>` (also called f-strings for
short) let you include the value of Python expressions inside a string by
prefixing the string with ``f`` or ``F`` and writing expressions as
``{expression}``.

An optional format specifier can follow the expression. This allows greater
control over how the value is formatted. The following example rounds pi to
three places after the decimal::

   >>> import math
   >>> print(f'The value of pi is approximately {math.pi:.3f}.')
   The value of pi is approximately 3.142.

Passing an integer after the ``':'`` will cause that field to be a minimum
number of characters wide.  This is useful for making columns line up. ::

   >>> table = {'Sjoerd': 4127, 'Jack': 4098, 'Dcab': 7678}
   >>> for name, phone in table.items():
   ...     print(f'{name:10} ==> {phone:10d}')
   ...
   Sjoerd     ==>       4127
   Jack       ==>       4098
   Dcab       ==>       7678

Other modifiers can be used to convert the value before it is formatted.
``'!a'`` applies :func:`ascii`, ``'!s'`` applies :func:`str`, and ``'!r'``
applies :func:`repr`::

   >>> animals = 'eels'
   >>> print(f'My hovercraft is full of {animals}.')
   My hovercraft is full of eels.
   >>> print(f'My hovercraft is full of {animals!r}.')
   My hovercraft is full of 'eels'.

The ``=`` specifier can be used to expand an expression to the text of the
expression, an equal sign, then the representation of the evaluated expression:

   >>> bugs = 'roaches'
   >>> count = 13
   >>> area = 'living room'
   >>> print(f'Debugging {bugs=} {count=} {area=}')
   Debugging bugs='roaches' count=13 area='living room'

See :ref:`self-documenting expressions <bpo-36817-whatsnew>` for more information
on the ``=`` specifier. For a reference on these format specifications, see
the reference guide for the :ref:`formatspec`.

.. _tut-string-format:

The string format() method
--------------------------

Basic usage of the :meth:`str.format` method looks like this::

   >>> print('We are the {} who say "{}!"'.format('knights', 'Ni'))
   We are the knights who say "Ni!"

The brackets and characters within them (called format fields) are replaced with
the objects passed into the :meth:`str.format` method.  A number in the
brackets can be used to refer to the position of the object passed into the
:meth:`str.format` method. ::

   >>> print('{0} and {1}'.format('spam', 'eggs'))
   spam and eggs
   >>> print('{1} and {0}'.format('spam', 'eggs'))
   eggs and spam

If keyword arguments are used in the :meth:`str.format` method, their values
are referred to by using the name of the argument. ::

   >>> print('This {food} is {adjective}.'.format(
   ...       food='spam', adjective='absolutely horrible'))
   This spam is absolutely horrible.

Positional and keyword arguments can be arbitrarily combined::

   >>> print('The story of {0}, {1}, and {other}.'.format('Bill', 'Manfred',
   ...                                                    other='Georg'))
   The story of Bill, Manfred, and Georg.

If you have a really long format string that you don't want to split up, it
would be nice if you could reference the variables to be formatted by name
instead of by position.  This can be done by simply passing the dict and using
square brackets ``'[]'`` to access the keys. ::

   >>> table = {'Sjoerd': 4127, 'Jack': 4098, 'Dcab': 8637678}
   >>> print('Jack: {0[Jack]:d}; Sjoerd: {0[Sjoerd]:d}; '
   ...       'Dcab: {0[Dcab]:d}'.format(table))
   Jack: 4098; Sjoerd: 4127; Dcab: 8637678

This could also be done by passing the ``table`` dictionary as keyword arguments with the ``**``
notation. ::

   >>> table = {'Sjoerd': 4127, 'Jack': 4098, 'Dcab': 8637678}
   >>> print('Jack: {Jack:d}; Sjoerd: {Sjoerd:d}; Dcab: {Dcab:d}'.format(**table))
   Jack: 4098; Sjoerd: 4127; Dcab: 8637678

This is particularly useful in combination with the built-in function
:func:`vars`, which returns a dictionary containing all local variables::

   >>> table = {k: str(v) for k, v in vars().items()}
   >>> message = " ".join([f'{k}: ' + '{' + k +'};' for k in table.keys()])
   >>> print(message.format(**table))
   __name__: __main__; __doc__: None; __package__: None; __loader__: ...

As an example, the following lines produce a tidily aligned
set of columns giving integers and their squares and cubes::

   >>> for x in range(1, 11):
   ...     print('{0:2d} {1:3d} {2:4d}'.format(x, x*x, x*x*x))
   ...
    1   1    1
    2   4    8
    3   9   27
    4  16   64
    5  25  125
    6  36  216
    7  49  343
    8  64  512
    9  81  729
   10 100 1000

For a complete overview of string formatting with :meth:`str.format`, see
:ref:`formatstrings`.

Manual string formatting
------------------------

Here's the same table of squares and cubes, formatted manually::

   >>> for x in range(1, 11):
   ...     print(repr(x).rjust(2), repr(x*x).rjust(3), end=' ')
   ...     # Note use of 'end' on previous line
   ...     print(repr(x*x*x).rjust(4))
   ...
    1   1    1
    2   4    8
    3   9   27
    4  16   64
    5  25  125
    6  36  216
    7  49  343
    8  64  512
    9  81  729
   10 100 1000

(Note that the one space between each column was added by the
way :func:`print` works: it always adds spaces between its arguments.)

The :meth:`str.rjust` method of string objects right-justifies a string in a
field of a given width by padding it with spaces on the left. There are
similar methods :meth:`str.ljust` and :meth:`str.center`. These methods do
not write anything, they just return a new string. If the input string is too
long, they don't truncate it, but return it unchanged; this will mess up your
column lay-out but that's usually better than the alternative, which would be
lying about a value. (If you really want truncation you can always add a
slice operation, as in ``x.ljust(n)[:n]``.)

There is another method, :meth:`str.zfill`, which pads a numeric string on the
left with zeros.  It understands about plus and minus signs::

   >>> '12'.zfill(5)
   '00012'
   >>> '-3.14'.zfill(7)
   '-003.14'
   >>> '3.14159265359'.zfill(5)
   '3.14159265359'

Old string formatting
---------------------

The % operator (modulo) can also be used for string formatting.
Given ``format % values`` (where *format* is a string),
``%`` conversion specifications in *format* are replaced with
zero or more elements of *values*.
This operation is commonly known as string
interpolation. For example::

   >>> import math
   >>> print('The value of pi is approximately %5.3f.' % math.pi)
   The value of pi is approximately 3.142.

More information can be found in the :ref:`old-string-formatting` section.

.. _tut-files:

Reading and writing files
=========================

.. index::
   pair: built-in function; open
   pair: object; file

:func:`open` returns a :term:`file object`, and is most commonly used with
two positional arguments: ``open(filename, mode)``

::

   >>> f = open('workfile', 'w')

.. XXX str(f) is <io.TextIOWrapper object at 0x82e8dc4>

   >>> print(f)
   <open file 'workfile', mode 'w' at 80a0960>

The first argument is a string containing the filename.  The second argument is
another string containing a few characters describing the way in which the file
will be used.  *mode* can be ``'r'`` when the file will only be read, ``'w'``
for only writing (an existing file with the same name will be erased), and
``'a'`` opens the file for appending; any data written to the file is
automatically added to the end.  ``'r+'`` opens the file for both reading and
writing. The *mode* argument is optional; ``'r'`` will be assumed if it's
omitted.

Normally, files are opened in :dfn:`text mode`, that means, you read and write
strings from and to the file, which are encoded in a specific *encoding*.
If *encoding* is not specified, the default is UTF-8 (see :func:`open`).
Appending a ``'b'`` to the mode opens the file in :dfn:`binary mode`.
Binary mode data is read and written as :class:`bytes` objects.
You can not specify *encoding* when opening file in binary mode.

In text mode, the default when reading is to convert platform-specific line
endings (``\n`` on Unix, ``\r\n`` on Windows) to just ``\n``.  When writing in
text mode, the default is to convert occurrences of ``\n`` back to
platform-specific line endings.  This behind-the-scenes modification
to file data is fine for text files, but will corrupt binary data like that in
:file:`JPEG` or :file:`EXE` files.  Be very careful to use binary mode when
reading and writing such files.

It is good practice to use the :keyword:`with` keyword when dealing
with file objects.  The advantage is that the file is properly closed
after its suite finishes, even if an exception is raised at some
point.  Using :keyword:`!with` is also much shorter than writing
equivalent :keyword:`try`\ -\ :keyword:`finally` blocks::

    >>> with open('workfile') as f:
    ...     read_data = f.read()

    >>> # We can check that the file has been automatically closed.
    >>> f.closed
    True

If you're not using the :keyword:`with` keyword, then you should call
``f.close()`` to close the file and immediately free up any system
resources used by it.

.. warning::
   Calling ``f.write()`` without using the :keyword:`!with` keyword or calling
   ``f.close()`` **might** result in the arguments
   of ``f.write()`` not being completely written to the disk, even if the
   program exits successfully.

..
   See also https://bugs.python.org/issue17852

After a file object is closed, either by a :keyword:`with` statement
or by calling ``f.close()``, attempts to use the file object will
automatically fail. ::

   >>> f.close()
   >>> f.read()
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
   ValueError: I/O operation on closed file.

.. _tut-filemethods:

Methods of file objects
-----------------------

The rest of the examples in this section will assume that a file object called
``f`` has already been created.

To read a file's contents, call ``f.read(size)``, which reads some quantity of
data and returns it as a string (in text mode) or bytes object (in binary mode).
*size* is an optional numeric argument.  When *size* is omitted or negative, the
entire contents of the file will be read and returned; it's your problem if the
file is twice as large as your machine's memory. Otherwise, at most *size*
characters (in text mode) or *size* bytes (in binary mode) are read and returned.
If the end of the file has been reached, ``f.read()`` will return an empty
string (``''``).  ::

   >>> f.read()
   'This is the entire file.\n'
   >>> f.read()
   ''

``f.readline()`` reads a single line from the file; a newline character (``\n``)
is left at the end of the string, and is only omitted on the last line of the
file if the file doesn't end in a newline.  This makes the return value
unambiguous; if ``f.readline()`` returns an empty string, the end of the file
has been reached, while a blank line is represented by ``'\n'``, a string
containing only a single newline.  ::

   >>> f.readline()
   'This is the first line of the file.\n'
   >>> f.readline()
   'Second line of the file\n'
   >>> f.readline()
   ''

For reading lines from a file, you can loop over the file object. This is memory
efficient, fast, and leads to simple code::

   >>> for line in f:
   ...     print(line, end='')
   ...
   This is the first line of the file.
   Second line of the file

If you want to read all the lines of a file in a list you can also use
``list(f)`` or ``f.readlines()``.

``f.write(string)`` writes the contents of *string* to the file, returning
the number of characters written. ::

   >>> f.write('This is a test\n')
   15

Other types of objects need to be converted -- either to a string (in text mode)
or a bytes object (in binary mode) -- before writing them::

   >>> value = ('the answer', 42)
   >>> s = str(value)  # convert the tuple to string
   >>> f.write(s)
   18

``f.tell()`` returns an integer giving the file object's current position in the file
represented as number of bytes from the beginning of the file when in binary mode and
an opaque number when in text mode.

To change the file object's position, use ``f.seek(offset, whence)``.  The position is computed
from adding *offset* to a reference point; the reference point is selected by
the *whence* argument.  A *whence* value of 0 measures from the beginning
of the file, 1 uses the current file position, and 2 uses the end of the file as
the reference point.  *whence* can be omitted and defaults to 0, using the
beginning of the file as the reference point. ::

   >>> f = open('workfile', 'rb+')
   >>> f.write(b'0123456789abcdef')
   16
   >>> f.seek(5)      # Go to the 6th byte in the file
   5
   >>> f.read(1)
   b'5'
   >>> f.seek(-3, 2)  # Go to the 3rd byte before the end
   13
   >>> f.read(1)
   b'd'

In text files (those opened without a ``b`` in the mode string), only seeks
relative to the beginning of the file are allowed (the exception being seeking
to the very file end with ``seek(0, 2)``) and the only valid *offset* values are
those returned from the ``f.tell()``, or zero. Any other *offset* value produces
undefined behaviour.

File objects have some additional methods, such as :meth:`~io.IOBase.isatty` and
:meth:`~io.IOBase.truncate` which are less frequently used; consult the Library
Reference for a complete guide to file objects.

.. _tut-json:

Saving structured data with :mod:`json`
---------------------------------------

.. index:: pair: module; json

Strings can easily be written to and read from a file.  Numbers take a bit more
effort, since the :meth:`~io.TextIOBase.read` method only returns strings, which will have to
be passed to a function like :func:`int`, which takes a string like ``'123'``
and returns its numeric value 123.  When you want to save more complex data
types like nested lists and dictionaries, parsing and serializing by hand
becomes complicated.

Rather than having users constantly writing and debugging code to save
complicated data types to files, Python allows you to use the popular data
interchange format called `JSON (JavaScript Object Notation)
<https://json.org>`_.  The standard module called :mod:`json` can take Python
data hierarchies, and convert them to string representations; this process is
called :dfn:`serializing`.  Reconstructing the data from the string representation
is called :dfn:`deserializing`.  Between serializing and deserializing, the
string representing the object may have been stored in a file or data, or
sent over a network connection to some distant machine.

.. note::
   The JSON format is commonly used by modern applications to allow for data
   exchange.  Many programmers are already familiar with it, which makes
   it a good choice for interoperability.

If you have an object ``x``, you can view its JSON string representation with a
simple line of code::

   >>> import json
   >>> x = [1, 'simple', 'list']
   >>> json.dumps(x)
   '[1, "simple", "list"]'

Another variant of the :func:`~json.dumps` function, called :func:`~json.dump`,
simply serializes the object to a :term:`text file`.  So if ``f`` is a
:term:`text file` object opened for writing, we can do this::

   json.dump(x, f)

To decode the object again, if ``f`` is a :term:`binary file` or
:term:`text file` object which has been opened for reading::

   x = json.load(f)

.. note::
   JSON files must be encoded in UTF-8, the default encoding for
   :term:`text files <text file>`.

This simple serialization technique can handle lists and dictionaries, but
serializing arbitrary class instances in JSON requires a bit of extra effort.
The reference for the :mod:`json` module contains an explanation of this.

.. seealso::

   :mod:`pickle` - the pickle module

   Contrary to :ref:`JSON <tut-json>`, *pickle* is a protocol which allows
   the serialization of arbitrarily complex Python objects.  As such, it is
   specific to Python and cannot be used to communicate with applications
   written in other languages.  It is also insecure by default:
   deserializing pickle data coming from an untrusted source can execute
   arbitrary code, if the data was crafted by a skilled attacker.

.. _tut-errors:

*********************
Errors and Exceptions
*********************

Until now error messages haven't been more than mentioned, but if you have tried
out the examples you have probably seen some.  There are (at least) two
distinguishable kinds of errors: *syntax errors* and *exceptions*.

.. _tut-syntaxerrors:

Syntax Errors
=============

Syntax errors, also known as parsing errors, are perhaps the most common kind of
complaint you get while you are still learning Python::

   >>> while True print('Hello world')
     File "<stdin>", line 1
       while True print('Hello world')
                  ^^^^^
   SyntaxError: invalid syntax

The parser repeats the offending line and displays little arrows pointing
at the place where the error was detected.  Note that this is not always the
place that needs to be fixed.  In the example, the error is detected at the
function :func:`print`, since a colon (``':'``) is missing just before it.

The file name (``<stdin>`` in our example) and line number are printed so you
know where to look in case the input came from a file.

.. _tut-exceptions:

Exceptions
==========

Even if a statement or expression is syntactically correct, it may cause an
error when an attempt is made to execute it. Errors detected during execution
are called *exceptions* and are not unconditionally fatal: you will soon learn
how to handle them in Python programs.  Most exceptions are not handled by
programs, however, and result in error messages as shown here::

   >>> 10 * (1/0)
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
       10 * (1/0)
             ~^~
   ZeroDivisionError: division by zero
   >>> 4 + spam*3
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
       4 + spam*3
           ^^^^
   NameError: name 'spam' is not defined
   >>> '2' + 2
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
       '2' + 2
       ~~~~^~~
   TypeError: can only concatenate str (not "int") to str

The last line of the error message indicates what happened. Exceptions come in
different types, and the type is printed as part of the message: the types in
the example are :exc:`ZeroDivisionError`, :exc:`NameError` and :exc:`TypeError`.
The string printed as the exception type is the name of the built-in exception
that occurred.  This is true for all built-in exceptions, but need not be true
for user-defined exceptions (although it is a useful convention). Standard
exception names are built-in identifiers (not reserved keywords).

The rest of the line provides detail based on the type of exception and what
caused it.

The preceding part of the error message shows the context where the exception
occurred, in the form of a stack traceback. In general it contains a stack
traceback listing source lines; however, it will not display lines read from
standard input.

:ref:`bltin-exceptions` lists the built-in exceptions and their meanings.

.. _tut-handling:

Handling Exceptions
===================

It is possible to write programs that handle selected exceptions. Look at the
following example, which asks the user for input until a valid integer has been
entered, but allows the user to interrupt the program (using :kbd:`Control-C` or
whatever the operating system supports); note that a user-generated interruption
is signalled by raising the :exc:`KeyboardInterrupt` exception. ::

   >>> while True:
   ...     try:
   ...         x = int(input("Please enter a number: "))
   ...         break
   ...     except ValueError:
   ...         print("Oops!  That was no valid number.  Try again...")
   ...

The :keyword:`try` statement works as follows.

* First, the *try clause* (the statement(s) between the :keyword:`try` and
  :keyword:`except` keywords) is executed.

* If no exception occurs, the *except clause* is skipped and execution of the
  :keyword:`try` statement is finished.

* If an exception occurs during execution of the :keyword:`try` clause, the rest of the
  clause is skipped.  Then, if its type matches the exception named after the
  :keyword:`except` keyword, the *except clause* is executed, and then execution
  continues after the try/except block.

* If an exception occurs which does not match the exception named in the *except
  clause*, it is passed on to outer :keyword:`try` statements; if no handler is
  found, it is an *unhandled exception* and execution stops with an error message.

A :keyword:`try` statement may have more than one *except clause*, to specify
handlers for different exceptions.  At most one handler will be executed.
Handlers only handle exceptions that occur in the corresponding *try clause*,
not in other handlers of the same :keyword:`!try` statement.  An *except clause*
may name multiple exceptions, for example::

   ... except RuntimeError, TypeError, NameError:
   ...     pass

A class in an :keyword:`except` clause matches exceptions which are instances of the
class itself or one of its derived classes (but not the other way around --- an
*except clause* listing a derived class does not match instances of its base classes).
For example, the following code will print B, C, D in that order::

   class B(Exception):
       pass

   class C(B):
       pass

   class D(C):
       pass

   for cls in [B, C, D]:
       try:
           raise cls()
       except D:
           print("D")
       except C:
           print("C")
       except B:
           print("B")

Note that if the *except clauses* were reversed (with ``except B`` first), it
would have printed B, B, B --- the first matching *except clause* is triggered.

When an exception occurs, it may have associated values, also known as the
exception's *arguments*. The presence and types of the arguments depend on the
exception type.

The *except clause* may specify a variable after the exception name.  The
variable is bound to the exception instance which typically has an ``args``
attribute that stores the arguments. For convenience, builtin exception
types define :meth:`~object.__str__` to print all the arguments without explicitly
accessing ``.args``.  ::

   >>> try:
   ...     raise Exception('spam', 'eggs')
   ... except Exception as inst:
   ...     print(type(inst))    # the exception type
   ...     print(inst.args)     # arguments stored in .args
   ...     print(inst)          # __str__ allows args to be printed directly,
   ...                          # but may be overridden in exception subclasses
   ...     x, y = inst.args     # unpack args
   ...     print('x =', x)
   ...     print('y =', y)
   ...
   <class 'Exception'>
   ('spam', 'eggs')
   ('spam', 'eggs')
   x = spam
   y = eggs

The exception's :meth:`~object.__str__` output is printed as the last part ('detail')
of the message for unhandled exceptions.

:exc:`BaseException` is the common base class of all exceptions. One of its
subclasses, :exc:`Exception`, is the base class of all the non-fatal exceptions.
Exceptions which are not subclasses of :exc:`Exception` are not typically
handled, because they are used to indicate that the program should terminate.
They include :exc:`SystemExit` which is raised by :meth:`sys.exit` and
:exc:`KeyboardInterrupt` which is raised when a user wishes to interrupt
the program.

:exc:`Exception` can be used as a wildcard that catches (almost) everything.
However, it is good practice to be as specific as possible with the types
of exceptions that we intend to handle, and to allow any unexpected
exceptions to propagate on.

The most common pattern for handling :exc:`Exception` is to print or log
the exception and then re-raise it (allowing a caller to handle the
exception as well)::

   import sys

   try:
       f = open('myfile.txt')
       s = f.readline()
       i = int(s.strip())
   except OSError as err:
       print("OS error:", err)
   except ValueError:
       print("Could not convert data to an integer.")
   except Exception as err:
       print(f"Unexpected {err=}, {type(err)=}")
       raise

The :keyword:`try` ... :keyword:`except` statement has an optional *else
clause*, which, when present, must follow all *except clauses*.  It is useful
for code that must be executed if the *try clause* does not raise an exception.
For example::

   for arg in sys.argv[1:]:
       try:
           f = open(arg, 'r')
       except OSError:
           print('cannot open', arg)
       else:
           print(arg, 'has', len(f.readlines()), 'lines')
           f.close()

The use of the :keyword:`!else` clause is better than adding additional code to
the :keyword:`try` clause because it avoids accidentally catching an exception
that wasn't raised by the code being protected by the :keyword:`!try` ...
:keyword:`!except` statement.

Exception handlers do not handle only exceptions that occur immediately in the
*try clause*, but also those that occur inside functions that are called (even
indirectly) in the *try clause*. For example::

   >>> def this_fails():
   ...     x = 1/0
   ...
   >>> try:
   ...     this_fails()
   ... except ZeroDivisionError as err:
   ...     print('Handling run-time error:', err)
   ...
   Handling run-time error: division by zero

.. _tut-raising:

Raising Exceptions
==================

The :keyword:`raise` statement allows the programmer to force a specified
exception to occur. For example::

   >>> raise NameError('HiThere')
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
       raise NameError('HiThere')
   NameError: HiThere

The sole argument to :keyword:`raise` indicates the exception to be raised.
This must be either an exception instance or an exception class (a class that
derives from :class:`BaseException`, such as :exc:`Exception` or one of its
subclasses).  If an exception class is passed, it will be implicitly
instantiated by calling its constructor with no arguments::

   raise ValueError  # shorthand for 'raise ValueError()'

If you need to determine whether an exception was raised but don't intend to
handle it, a simpler form of the :keyword:`raise` statement allows you to
re-raise the exception::

   >>> try:
   ...     raise NameError('HiThere')
   ... except NameError:
   ...     print('An exception flew by!')
   ...     raise
   ...
   An exception flew by!
   Traceback (most recent call last):
     File "<stdin>", line 2, in <module>
       raise NameError('HiThere')
   NameError: HiThere

.. _tut-exception-chaining:

Exception Chaining
==================

If an unhandled exception occurs inside an :keyword:`except` section, it will
have the exception being handled attached to it and included in the error
message::

    >>> try:
    ...     open("database.sqlite")
    ... except OSError:
    ...     raise RuntimeError("unable to handle error")
    ...
    Traceback (most recent call last):
      File "<stdin>", line 2, in <module>
        open("database.sqlite")
        ~~~~^^^^^^^^^^^^^^^^^^^
    FileNotFoundError: [Errno 2] No such file or directory: 'database.sqlite'
    <BLANKLINE>
    During handling of the above exception, another exception occurred:
    <BLANKLINE>
    Traceback (most recent call last):
      File "<stdin>", line 4, in <module>
        raise RuntimeError("unable to handle error")
    RuntimeError: unable to handle error

To indicate that an exception is a direct consequence of another, the
:keyword:`raise` statement allows an optional :keyword:`from<raise>` clause::

    # exc must be exception instance or None.
    raise RuntimeError from exc

This can be useful when you are transforming exceptions. For example::

    >>> def func():
    ...     raise ConnectionError
    ...
    >>> try:
    ...     func()
    ... except ConnectionError as exc:
    ...     raise RuntimeError('Failed to open database') from exc
    ...
    Traceback (most recent call last):
      File "<stdin>", line 2, in <module>
        func()
        ~~~~^^
      File "<stdin>", line 2, in func
    ConnectionError
    <BLANKLINE>
    The above exception was the direct cause of the following exception:
    <BLANKLINE>
    Traceback (most recent call last):
      File "<stdin>", line 4, in <module>
        raise RuntimeError('Failed to open database') from exc
    RuntimeError: Failed to open database

It also allows disabling automatic exception chaining using the ``from None``
idiom::

    >>> try:
    ...     open('database.sqlite')
    ... except OSError:
    ...     raise RuntimeError from None
    ...
    Traceback (most recent call last):
      File "<stdin>", line 4, in <module>
        raise RuntimeError from None
    RuntimeError

For more information about chaining mechanics, see :ref:`bltin-exceptions`.

.. _tut-userexceptions:

User-defined Exceptions
=======================

Programs may name their own exceptions by creating a new exception class (see
:ref:`tut-classes` for more about Python classes).  Exceptions should typically
be derived from the :exc:`Exception` class, either directly or indirectly.

Exception classes can be defined which do anything any other class can do, but
are usually kept simple, often only offering a number of attributes that allow
information about the error to be extracted by handlers for the exception.

Most exceptions are defined with names that end in "Error", similar to the
naming of the standard exceptions.

Many standard modules define their own exceptions to report errors that may
occur in functions they define.

.. _tut-cleanup:

Defining Clean-up Actions
=========================

The :keyword:`try` statement has another optional clause which is intended to
define clean-up actions that must be executed under all circumstances.  For
example::

   >>> try:
   ...     raise KeyboardInterrupt
   ... finally:
   ...     print('Goodbye, world!')
   ...
   Goodbye, world!
   Traceback (most recent call last):
     File "<stdin>", line 2, in <module>
       raise KeyboardInterrupt
   KeyboardInterrupt

If a :keyword:`finally` clause is present, the :keyword:`!finally`
clause will execute as the last task before the :keyword:`try`
statement completes. The :keyword:`!finally` clause runs whether or
not the :keyword:`!try` statement produces an exception. The following
points discuss more complex cases when an exception occurs:

* If an exception occurs during execution of the :keyword:`!try`
  clause, the exception may be handled by an :keyword:`except`
  clause. If the exception is not handled by an :keyword:`!except`
  clause, the exception is re-raised after the :keyword:`!finally`
  clause has been executed.

* An exception could occur during execution of an :keyword:`!except`
  or :keyword:`!else` clause. Again, the exception is re-raised after
  the :keyword:`!finally` clause has been executed.

* If the :keyword:`!finally` clause executes a :keyword:`break`,
  :keyword:`continue` or :keyword:`return` statement, exceptions are not
  re-raised. This can be confusing and is therefore discouraged. From
  version 3.14 the compiler emits a :exc:`SyntaxWarning` for it
  (see :pep:`765`).

* If the :keyword:`!try` statement reaches a :keyword:`break`,
  :keyword:`continue` or :keyword:`return` statement, the
  :keyword:`!finally` clause will execute just prior to the
  :keyword:`!break`, :keyword:`!continue` or :keyword:`!return`
  statement's execution.

* If a :keyword:`!finally` clause includes a :keyword:`!return`
  statement, the returned value will be the one from the
  :keyword:`!finally` clause's :keyword:`!return` statement, not the
  value from the :keyword:`!try` clause's :keyword:`!return`
  statement. This can be confusing and is therefore discouraged. From
  version 3.14 the compiler emits a :exc:`SyntaxWarning` for it
  (see :pep:`765`).

For example::

   >>> def bool_return():
   ...     try:
   ...         return True
   ...     finally:
   ...         return False
   ...
   >>> bool_return()
   False

A more complicated example::

   >>> def divide(x, y):
   ...     try:
   ...         result = x / y
   ...     except ZeroDivisionError:
   ...         print("division by zero!")
   ...     else:
   ...         print("result is", result)
   ...     finally:
   ...         print("executing finally clause")
   ...
   >>> divide(2, 1)
   result is 2.0
   executing finally clause
   >>> divide(2, 0)
   division by zero!
   executing finally clause
   >>> divide("2", "1")
   executing finally clause
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
       divide("2", "1")
       ~~~~~~^^^^^^^^^^
     File "<stdin>", line 3, in divide
       result = x / y
                ~~^~~
   TypeError: unsupported operand type(s) for /: 'str' and 'str'

As you can see, the :keyword:`finally` clause is executed in any event.  The
:exc:`TypeError` raised by dividing two strings is not handled by the
:keyword:`except` clause and therefore re-raised after the :keyword:`!finally`
clause has been executed.

In real world applications, the :keyword:`finally` clause is useful for
releasing external resources (such as files or network connections), regardless
of whether the use of the resource was successful.

.. _tut-cleanup-with:

Predefined Clean-up Actions
===========================

Some objects define standard clean-up actions to be undertaken when the object
is no longer needed, regardless of whether or not the operation using the object
succeeded or failed. Look at the following example, which tries to open a file
and print its contents to the screen. ::

   for line in open("myfile.txt"):
       print(line, end="")

The problem with this code is that it leaves the file open for an indeterminate
amount of time after this part of the code has finished executing.
This is not an issue in simple scripts, but can be a problem for larger
applications. The :keyword:`with` statement allows objects like files to be
used in a way that ensures they are always cleaned up promptly and correctly. ::

   with open("myfile.txt") as f:
       for line in f:
           print(line, end="")

After the statement is executed, the file *f* is always closed, even if a
problem was encountered while processing the lines. Objects which, like files,
provide predefined clean-up actions will indicate this in their documentation.

.. _tut-exception-groups:

Raising and Handling Multiple Unrelated Exceptions
==================================================

There are situations where it is necessary to report several exceptions that
have occurred. This is often the case in concurrency frameworks, when several
tasks may have failed in parallel, but there are also other use cases where
it is desirable to continue execution and collect multiple errors rather than
raise the first exception.

The builtin :exc:`ExceptionGroup` wraps a list of exception instances so
that they can be raised together. It is an exception itself, so it can be
caught like any other exception. ::

   >>> def f():
   ...     excs = [OSError('error 1'), SystemError('error 2')]
   ...     raise ExceptionGroup('there were problems', excs)
   ...
   >>> f()
     + Exception Group Traceback (most recent call last):
     |   File "<stdin>", line 1, in <module>
     |     f()
     |     ~^^
     |   File "<stdin>", line 3, in f
     |     raise ExceptionGroup('there were problems', excs)
     | ExceptionGroup: there were problems (2 sub-exceptions)
     +-+---------------- 1 ----------------
       | OSError: error 1
       +---------------- 2 ----------------
       | SystemError: error 2
       +------------------------------------
   >>> try:
   ...     f()
   ... except Exception as e:
   ...     print(f'caught {type(e)}: {e}')
   ...
   caught <class 'ExceptionGroup'>: there were problems (2 sub-exceptions)
   >>>

By using ``except*`` instead of ``except``, we can selectively
handle only the exceptions in the group that match a certain
type. In the following example, which shows a nested exception
group, each ``except*`` clause extracts from the group exceptions
of a certain type while letting all other exceptions propagate to
other clauses and eventually to be reraised. ::

   >>> def f():
   ...     raise ExceptionGroup(
   ...         "group1",
   ...         [
   ...             OSError(1),
   ...             SystemError(2),
   ...             ExceptionGroup(
   ...                 "group2",
   ...                 [
   ...                     OSError(3),
   ...                     RecursionError(4)
   ...                 ]
   ...             )
   ...         ]
   ...     )
   ...
   >>> try:
   ...     f()
   ... except* OSError as e:
   ...     print("There were OSErrors")
   ... except* SystemError as e:
   ...     print("There were SystemErrors")
   ...
   There were OSErrors
   There were SystemErrors
     + Exception Group Traceback (most recent call last):
     |   File "<stdin>", line 2, in <module>
     |     f()
     |     ~^^
     |   File "<stdin>", line 2, in f
     |     raise ExceptionGroup(
     |     ...<12 lines>...
     |     )
     | ExceptionGroup: group1 (1 sub-exception)
     +-+---------------- 1 ----------------
       | ExceptionGroup: group2 (1 sub-exception)
       +-+---------------- 1 ----------------
         | RecursionError: 4
         +------------------------------------
   >>>

Note that the exceptions nested in an exception group must be instances,
not types. This is because in practice the exceptions would typically
be ones that have already been raised and caught by the program, along
the following pattern::

   >>> excs = []
   ... for test in tests:
   ...     try:
   ...         test.run()
   ...     except Exception as e:
   ...         excs.append(e)
   ...
   >>> if excs:
   ...    raise ExceptionGroup("Test Failures", excs)
   ...

.. _tut-exception-notes:

Enriching Exceptions with Notes
===============================

When an exception is created in order to be raised, it is usually initialized
with information that describes the error that has occurred. There are cases
where it is useful to add information after the exception was caught. For this
purpose, exceptions have a method ``add_note(note)`` that accepts a string and
adds it to the exception's notes list. The standard traceback rendering
includes all notes, in the order they were added, after the exception. ::

   >>> try:
   ...     raise TypeError('bad type')
   ... except Exception as e:
   ...     e.add_note('Add some information')
   ...     e.add_note('Add some more information')
   ...     raise
   ...
   Traceback (most recent call last):
     File "<stdin>", line 2, in <module>
       raise TypeError('bad type')
   TypeError: bad type
   Add some information
   Add some more information
   >>>

For example, when collecting exceptions into an exception group, we may want
to add context information for the individual errors. In the following each
exception in the group has a note indicating when this error has occurred. ::

   >>> def f():
   ...     raise OSError('operation failed')
   ...
   >>> excs = []
   >>> for i in range(3):
   ...     try:
   ...         f()
   ...     except Exception as e:
   ...         e.add_note(f'Happened in Iteration {i+1}')
   ...         excs.append(e)
   ...
   >>> raise ExceptionGroup('We have some problems', excs)
     + Exception Group Traceback (most recent call last):
     |   File "<stdin>", line 1, in <module>
     |     raise ExceptionGroup('We have some problems', excs)
     | ExceptionGroup: We have some problems (3 sub-exceptions)
     +-+---------------- 1 ----------------
       | Traceback (most recent call last):
       |   File "<stdin>", line 3, in <module>
       |     f()
       |     ~^^
       |   File "<stdin>", line 2, in f
       |     raise OSError('operation failed')
       | OSError: operation failed
       | Happened in Iteration 1
       +---------------- 2 ----------------
       | Traceback (most recent call last):
       |   File "<stdin>", line 3, in <module>
       |     f()
       |     ~^^
       |   File "<stdin>", line 2, in f
       |     raise OSError('operation failed')
       | OSError: operation failed
       | Happened in Iteration 2
       +---------------- 3 ----------------
       | Traceback (most recent call last):
       |   File "<stdin>", line 3, in <module>
       |     f()
       |     ~^^
       |   File "<stdin>", line 2, in f
       |     raise OSError('operation failed')
       | OSError: operation failed
       | Happened in Iteration 3
       +------------------------------------
   >>>

.. _tut-classes:

*******
Classes
*******

Classes provide a means of bundling data and functionality together.  Creating
a new class creates a new *type* of object, allowing new *instances* of that
type to be made.  Each class instance can have attributes attached to it for
maintaining its state.  Class instances can also have methods (defined by its
class) for modifying its state.

Compared with other programming languages, Python's class mechanism adds classes
with a minimum of new syntax and semantics.  It is a mixture of the class
mechanisms found in C++ and Modula-3.  Python classes provide all the standard
features of Object Oriented Programming: the class inheritance mechanism allows
multiple base classes, a derived class can override any methods of its base
class or classes, and a method can call the method of a base class with the same
name.  Objects can contain arbitrary amounts and kinds of data.  As is true for
modules, classes partake of the dynamic nature of Python: they are created at
runtime, and can be modified further after creation.

In C++ terminology, normally class members (including the data members) are
*public* (except see below :ref:`tut-private`), and all member functions are
*virtual*.  As in Modula-3, there are no shorthands for referencing the object's
members from its methods: the method function is declared with an explicit first
argument representing the object, which is provided implicitly by the call.  As
in Smalltalk, classes themselves are objects.  This provides semantics for
importing and renaming.  Unlike C++ and Modula-3, built-in types can be used as
base classes for extension by the user.  Also, like in C++, most built-in
operators with special syntax (arithmetic operators, subscripting etc.) can be
redefined for class instances.

(Lacking universally accepted terminology to talk about classes, I will make
occasional use of Smalltalk and C++ terms.  I would use Modula-3 terms, since
its object-oriented semantics are closer to those of Python than C++, but I
expect that few readers have heard of it.)

.. _tut-object:

A Word About Names and Objects
==============================

Objects have individuality, and multiple names (in multiple scopes) can be bound
to the same object.  This is known as aliasing in other languages.  This is
usually not appreciated on a first glance at Python, and can be safely ignored
when dealing with immutable basic types (numbers, strings, tuples).  However,
aliasing has a possibly surprising effect on the semantics of Python code
involving mutable objects such as lists, dictionaries, and most other types.
This is usually used to the benefit of the program, since aliases behave like
pointers in some respects.  For example, passing an object is cheap since only a
pointer is passed by the implementation; and if a function modifies an object
passed as an argument, the caller will see the change --- this eliminates the
need for two different argument passing mechanisms as in Pascal.

.. _tut-scopes:

Python Scopes and Namespaces
============================

Before introducing classes, I first have to tell you something about Python's
scope rules.  Class definitions play some neat tricks with namespaces, and you
need to know how scopes and namespaces work to fully understand what's going on.
Incidentally, knowledge about this subject is useful for any advanced Python
programmer.

Let's begin with some definitions.

A *namespace* is a mapping from names to objects.  Most namespaces are currently
implemented as Python dictionaries, but that's normally not noticeable in any
way (except for performance), and it may change in the future.  Examples of
namespaces are: the set of built-in names (containing functions such as :func:`abs`, and
built-in exception names); the global names in a module; and the local names in
a function invocation.  In a sense the set of attributes of an object also form
a namespace.  The important thing to know about namespaces is that there is
absolutely no relation between names in different namespaces; for instance, two
different modules may both define a function ``maximize`` without confusion ---
users of the modules must prefix it with the module name.

By the way, I use the word *attribute* for any name following a dot --- for
example, in the expression ``z.real``, ``real`` is an attribute of the object
``z``.  Strictly speaking, references to names in modules are attribute
references: in the expression ``modname.funcname``, ``modname`` is a module
object and ``funcname`` is an attribute of it.  In this case there happens to be
a straightforward mapping between the module's attributes and the global names
defined in the module: they share the same namespace!  [#]_

Attributes may be read-only or writable.  In the latter case, assignment to
attributes is possible.  Module attributes are writable: you can write
``modname.the_answer = 42``.  Writable attributes may also be deleted with the
:keyword:`del` statement.  For example, ``del modname.the_answer`` will remove
the attribute :attr:`!the_answer` from the object named by ``modname``.

Namespaces are created at different moments and have different lifetimes.  The
namespace containing the built-in names is created when the Python interpreter
starts up, and is never deleted.  The global namespace for a module is created
when the module definition is read in; normally, module namespaces also last
until the interpreter quits.  The statements executed by the top-level
invocation of the interpreter, either read from a script file or interactively,
are considered part of a module called :mod:`__main__`, so they have their own
global namespace.  (The built-in names actually also live in a module; this is
called :mod:`builtins`.)

The local namespace for a function is created when the function is called, and
deleted when the function returns or raises an exception that is not handled
within the function.  (Actually, forgetting would be a better way to describe
what actually happens.)  Of course, recursive invocations each have their own
local namespace.

A *scope* is a textual region of a Python program where a namespace is directly
accessible.  "Directly accessible" here means that an unqualified reference to a
name attempts to find the name in the namespace.

Although scopes are determined statically, they are used dynamically. At any
time during execution, there are 3 or 4 nested scopes whose namespaces are
directly accessible:

* the innermost scope, which is searched first, contains the local names
* the scopes of any enclosing functions, which are searched starting with the
  nearest enclosing scope, contain non-local, but also non-global names
* the next-to-last scope contains the current module's global names
* the outermost scope (searched last) is the namespace containing built-in names

If a name is declared global, then all references and assignments go directly to
the next-to-last scope containing the module's global names.  To rebind variables
found outside of the innermost scope, the :keyword:`nonlocal` statement can be
used; if not declared nonlocal, those variables are read-only (an attempt to
write to such a variable will simply create a *new* local variable in the
innermost scope, leaving the identically named outer variable unchanged).

Usually, the local scope references the local names of the (textually) current
function.  Outside functions, the local scope references the same namespace as
the global scope: the module's namespace. Class definitions place yet another
namespace in the local scope.

It is important to realize that scopes are determined textually: the global
scope of a function defined in a module is that module's namespace, no matter
from where or by what alias the function is called.  On the other hand, the
actual search for names is done dynamically, at run time --- however, the
language definition is evolving towards static name resolution, at "compile"
time, so don't rely on dynamic name resolution!  (In fact, local variables are
already determined statically.)

A special quirk of Python is that -- if no :keyword:`global` or :keyword:`nonlocal`
statement is in effect -- assignments to names always go into the innermost scope.
Assignments do not copy data --- they just bind names to objects.  The same is true
for deletions: the statement ``del x`` removes the binding of ``x`` from the
namespace referenced by the local scope.  In fact, all operations that introduce
new names use the local scope: in particular, :keyword:`import` statements and
function definitions bind the module or function name in the local scope.

The :keyword:`global` statement can be used to indicate that particular
variables live in the global scope and should be rebound there; the
:keyword:`nonlocal` statement indicates that particular variables live in
an enclosing scope and should be rebound there.

.. _tut-scopeexample:

Scopes and Namespaces Example
-----------------------------

This is an example demonstrating how to reference the different scopes and
namespaces, and how :keyword:`global` and :keyword:`nonlocal` affect variable
binding::

   def scope_test():
       def do_local():
           spam = "local spam"

       def do_nonlocal():
           nonlocal spam
           spam = "nonlocal spam"

       def do_global():
           global spam
           spam = "global spam"

       spam = "test spam"
       do_local()
       print("After local assignment:", spam)
       do_nonlocal()
       print("After nonlocal assignment:", spam)
       do_global()
       print("After global assignment:", spam)

   scope_test()
   print("In global scope:", spam)

The output of the example code is:

.. code-block:: none

   After local assignment: test spam
   After nonlocal assignment: nonlocal spam
   After global assignment: nonlocal spam
   In global scope: global spam

Note how the *local* assignment (which is default) didn't change *scope_test*\'s
binding of *spam*.  The :keyword:`nonlocal` assignment changed *scope_test*\'s
binding of *spam*, and the :keyword:`global` assignment changed the module-level
binding.

You can also see that there was no previous binding for *spam* before the
:keyword:`global` assignment.

.. _tut-firstclasses:

A First Look at Classes
=======================

Classes introduce a little bit of new syntax, three new object types, and some
new semantics.

.. _tut-classdefinition:

Class Definition Syntax
-----------------------

The simplest form of class definition looks like this::

   class ClassName:
       <statement-1>
       .
       .
       .
       <statement-N>

Class definitions, like function definitions (:keyword:`def` statements) must be
executed before they have any effect.  (You could conceivably place a class
definition in a branch of an :keyword:`if` statement, or inside a function.)

In practice, the statements inside a class definition will usually be function
definitions, but other statements are allowed, and sometimes useful --- we'll
come back to this later.  The function definitions inside a class normally have
a peculiar form of argument list, dictated by the calling conventions for
methods --- again, this is explained later.

When a class definition is entered, a new namespace is created, and used as the
local scope --- thus, all assignments to local variables go into this new
namespace.  In particular, function definitions bind the name of the new
function here.

When a class definition is left normally (via the end), a *class object* is
created.  This is basically a wrapper around the contents of the namespace
created by the class definition; we'll learn more about class objects in the
next section.  The original local scope (the one in effect just before the class
definition was entered) is reinstated, and the class object is bound here to the
class name given in the class definition header (:class:`!ClassName` in the
example).

.. _tut-classobjects:

Class Objects
-------------

Class objects support two kinds of operations: attribute references and
instantiation.

*Attribute references* use the standard syntax used for all attribute references
in Python: ``obj.name``.  Valid attribute names are all the names that were in
the class's namespace when the class object was created.  So, if the class
definition looked like this::

   class MyClass:
       """A simple example class"""
       i = 12345

       def f(self):
           return 'hello world'

then ``MyClass.i`` and ``MyClass.f`` are valid attribute references, returning
an integer and a function object, respectively. Class attributes can also be
assigned to, so you can change the value of ``MyClass.i`` by assignment.
:attr:`~type.__doc__` is also a valid attribute, returning the docstring
belonging to the class: ``"A simple example class"``.

Class *instantiation* uses function notation.  Just pretend that the class
object is a parameterless function that returns a new instance of the class.
For example (assuming the above class)::

   x = MyClass()

creates a new *instance* of the class and assigns this object to the local
variable ``x``.

The instantiation operation ("calling" a class object) creates an empty object.
Many classes like to create objects with instances customized to a specific
initial state. Therefore a class may define a special method named
:meth:`~object.__init__`, like this::

   def __init__(self):
       self.data = []

When a class defines an :meth:`~object.__init__` method, class instantiation
automatically invokes :meth:`!__init__` for the newly created class instance.  So
in this example, a new, initialized instance can be obtained by::

   x = MyClass()

Of course, the :meth:`~object.__init__` method may have arguments for greater
flexibility.  In that case, arguments given to the class instantiation operator
are passed on to :meth:`!__init__`.  For example, ::

   >>> class Complex:
   ...     def __init__(self, realpart, imagpart):
   ...         self.r = realpart
   ...         self.i = imagpart
   ...
   >>> x = Complex(3.0, -4.5)
   >>> x.r, x.i
   (3.0, -4.5)

.. _tut-instanceobjects:

Instance Objects
----------------

Now what can we do with instance objects?  The only operations understood by
instance objects are attribute references.  There are two kinds of valid
attribute names: data attributes and methods.

*Data attributes* correspond to "instance variables" in Smalltalk, and to "data
members" in C++.  Data attributes need not be declared; like local variables,
they spring into existence when they are first assigned to.  For example, if
``x`` is the instance of :class:`!MyClass` created above, the following piece of
code will print the value ``16``, without leaving a trace::

   x.counter = 1
   while x.counter < 10:
       x.counter = x.counter * 2
   print(x.counter)
   del x.counter

The other kind of instance attribute reference is a *method*. A method is a
function that "belongs to" an object.

.. index:: pair: object; method

Valid method names of an instance object depend on its class.  By definition,
all attributes of a class that are function  objects define corresponding
methods of its instances.  So in our example, ``x.f`` is a valid method
reference, since ``MyClass.f`` is a function, but ``x.i`` is not, since
``MyClass.i`` is not.  But ``x.f`` is not the same thing as ``MyClass.f`` --- it
is a *method object*, not a function object.

.. _tut-methodobjects:

Method Objects
--------------

Usually, a method is called right after it is bound::

   x.f()

If ``x = MyClass()``, as above, this will return the string ``'hello world'``.
However, it is not necessary to call a method right away: ``x.f`` is a method
object, and can be stored away and called at a later time.  For example::

   xf = x.f
   while True:
       print(xf())

will continue to print ``hello world`` until the end of time.

What exactly happens when a method is called?  You may have noticed that
``x.f()`` was called without an argument above, even though the function
definition for :meth:`!f` specified an argument.  What happened to the argument?
Surely Python raises an exception when a function that requires an argument is
called without any --- even if the argument isn't actually used...

Actually, you may have guessed the answer: the special thing about methods is
that the instance object is passed as the first argument of the function.  In our
example, the call ``x.f()`` is exactly equivalent to ``MyClass.f(x)``.  In
general, calling a method with a list of *n* arguments is equivalent to calling
the corresponding function with an argument list that is created by inserting
the method's instance object before the first argument.

In general, methods work as follows.  When a non-data attribute
of an instance is referenced, the instance's class is searched.
If the name denotes a valid class attribute that is a function object,
references to both the instance object and the function object
are packed into a method object.  When the method object is called
with an argument list, a new argument list is constructed from the instance
object and the argument list, and the function object is called with this new
argument list.

.. _tut-class-and-instance-variables:

Class and Instance Variables
----------------------------

Generally speaking, instance variables are for data unique to each instance
and class variables are for attributes and methods shared by all instances
of the class::

    class Dog:

        kind = 'canine'         # class variable shared by all instances

        def __init__(self, name):
            self.name = name    # instance variable unique to each instance

    >>> d = Dog('Fido')
    >>> e = Dog('Buddy')
    >>> d.kind                  # shared by all dogs
    'canine'
    >>> e.kind                  # shared by all dogs
    'canine'
    >>> d.name                  # unique to d
    'Fido'
    >>> e.name                  # unique to e
    'Buddy'

As discussed in :ref:`tut-object`, shared data can have possibly surprising
effects involving :term:`mutable` objects such as lists and dictionaries.
For example, the *tricks* list in the following code should not be used as a
class variable because just a single list would be shared by all *Dog*
instances::

    class Dog:

        tricks = []             # mistaken use of a class variable

        def __init__(self, name):
            self.name = name

        def add_trick(self, trick):
            self.tricks.append(trick)

    >>> d = Dog('Fido')
    >>> e = Dog('Buddy')
    >>> d.add_trick('roll over')
    >>> e.add_trick('play dead')
    >>> d.tricks                # unexpectedly shared by all dogs
    ['roll over', 'play dead']

Correct design of the class should use an instance variable instead::

    class Dog:

        def __init__(self, name):
            self.name = name
            self.tricks = []    # creates a new empty list for each dog

        def add_trick(self, trick):
            self.tricks.append(trick)

    >>> d = Dog('Fido')
    >>> e = Dog('Buddy')
    >>> d.add_trick('roll over')
    >>> e.add_trick('play dead')
    >>> d.tricks
    ['roll over']
    >>> e.tricks
    ['play dead']

.. _tut-remarks:

Random Remarks
==============

.. These should perhaps be placed more carefully...

If the same attribute name occurs in both an instance and in a class,
then attribute lookup prioritizes the instance::

    >>> class Warehouse:
    ...    purpose = 'storage'
    ...    region = 'west'
    ...
    >>> w1 = Warehouse()
    >>> print(w1.purpose, w1.region)
    storage west
    >>> w2 = Warehouse()
    >>> w2.region = 'east'
    >>> print(w2.purpose, w2.region)
    storage east

Data attributes may be referenced by methods as well as by ordinary users
("clients") of an object.  In other words, classes are not usable to implement
pure abstract data types.  In fact, nothing in Python makes it possible to
enforce data hiding --- it is all based upon convention.  (On the other hand,
the Python implementation, written in C, can completely hide implementation
details and control access to an object if necessary; this can be used by
extensions to Python written in C.)

Clients should use data attributes with care --- clients may mess up invariants
maintained by the methods by stamping on their data attributes.  Note that
clients may add data attributes of their own to an instance object without
affecting the validity of the methods, as long as name conflicts are avoided ---
again, a naming convention can save a lot of headaches here.

There is no shorthand for referencing data attributes (or other methods!) from
within methods.  I find that this actually increases the readability of methods:
there is no chance of confusing local variables and instance variables when
glancing through a method.

Often, the first argument of a method is called ``self``.  This is nothing more
than a convention: the name ``self`` has absolutely no special meaning to
Python.  Note, however, that by not following the convention your code may be
less readable to other Python programmers, and it is also conceivable that a
*class browser* program might be written that relies upon such a convention.

Any function object that is a class attribute defines a method for instances of
that class.  It is not necessary that the function definition is textually
enclosed in the class definition: assigning a function object to a local
variable in the class is also ok.  For example::

   # Function defined outside the class
   def f1(self, x, y):
       return min(x, x+y)

   class C:
       f = f1

       def g(self):
           return 'hello world'

       h = g

Now ``f``, ``g`` and ``h`` are all attributes of class :class:`!C` that refer to
function objects, and consequently they are all methods of instances of
:class:`!C` --- ``h`` being exactly equivalent to ``g``.  Note that this practice
usually only serves to confuse the reader of a program.

Methods may call other methods by using method attributes of the ``self``
argument::

   class Bag:
       def __init__(self):
           self.data = []

       def add(self, x):
           self.data.append(x)

       def addtwice(self, x):
           self.add(x)
           self.add(x)

Methods may reference global names in the same way as ordinary functions.  The
global scope associated with a method is the module containing its
definition.  (A class is never used as a global scope.)  While one
rarely encounters a good reason for using global data in a method, there are
many legitimate uses of the global scope: for one thing, functions and modules
imported into the global scope can be used by methods, as well as functions and
classes defined in it.  Usually, the class containing the method is itself
defined in this global scope, and in the next section we'll find some good
reasons why a method would want to reference its own class.

Each value is an object, and therefore has a *class* (also called its *type*).
It is stored as ``object.__class__``.

.. _tut-inheritance:

Inheritance
===========

Of course, a language feature would not be worthy of the name "class" without
supporting inheritance.  The syntax for a derived class definition looks like
this::

   class DerivedClassName(BaseClassName):
       <statement-1>
       .
       .
       .
       <statement-N>

The name :class:`!BaseClassName` must be defined in a
namespace accessible from the scope containing the
derived class definition.  In place of a base class name, other arbitrary
expressions are also allowed.  This can be useful, for example, when the base
class is defined in another module::

   class DerivedClassName(modname.BaseClassName):

Execution of a derived class definition proceeds the same as for a base class.
When the class object is constructed, the base class is remembered.  This is
used for resolving attribute references: if a requested attribute is not found
in the class, the search proceeds to look in the base class.  This rule is
applied recursively if the base class itself is derived from some other class.

There's nothing special about instantiation of derived classes:
``DerivedClassName()`` creates a new instance of the class.  Method references
are resolved as follows: the corresponding class attribute is searched,
descending down the chain of base classes if necessary, and the method reference
is valid if this yields a function object.

Derived classes may override methods of their base classes.  Because methods
have no special privileges when calling other methods of the same object, a
method of a base class that calls another method defined in the same base class
may end up calling a method of a derived class that overrides it.  (For C++
programmers: all methods in Python are effectively ``virtual``.)

An overriding method in a derived class may in fact want to extend rather than
simply replace the base class method of the same name. There is a simple way to
call the base class method directly: just call ``BaseClassName.methodname(self,
arguments)``.  This is occasionally useful to clients as well.  (Note that this
only works if the base class is accessible as ``BaseClassName`` in the global
scope.)

Python has two built-in functions that work with inheritance:

* Use :func:`isinstance` to check an instance's type: ``isinstance(obj, int)``
  will be ``True`` only if ``obj.__class__`` is :class:`int` or some class
  derived from :class:`int`.

* Use :func:`issubclass` to check class inheritance: ``issubclass(bool, int)``
  is ``True`` since :class:`bool` is a subclass of :class:`int`.  However,
  ``issubclass(float, int)`` is ``False`` since :class:`float` is not a
  subclass of :class:`int`.

.. _tut-multiple:

Multiple Inheritance
--------------------

Python supports a form of multiple inheritance as well.  A class definition with
multiple base classes looks like this::

   class DerivedClassName(Base1, Base2, Base3):
       <statement-1>
       .
       .
       .
       <statement-N>

For most purposes, in the simplest cases, you can think of the search for
attributes inherited from a parent class as depth-first, left-to-right, not
searching twice in the same class where there is an overlap in the hierarchy.
Thus, if an attribute is not found in :class:`!DerivedClassName`, it is searched
for in :class:`!Base1`, then (recursively) in the base classes of :class:`!Base1`,
and if it was not found there, it was searched for in :class:`!Base2`, and so on.

In fact, it is slightly more complex than that; the method resolution order
changes dynamically to support cooperative calls to :func:`super`.  This
approach is known in some other multiple-inheritance languages as
call-next-method and is more powerful than the super call found in
single-inheritance languages.

Dynamic ordering is necessary because all cases of multiple inheritance exhibit
one or more diamond relationships (where at least one of the parent classes
can be accessed through multiple paths from the bottommost class).  For example,
all classes inherit from :class:`object`, so any case of multiple inheritance
provides more than one path to reach :class:`object`.  To keep the base classes
from being accessed more than once, the dynamic algorithm linearizes the search
order in a way that preserves the left-to-right ordering specified in each
class, that calls each parent only once, and that is monotonic (meaning that a
class can be subclassed without affecting the precedence order of its parents).
Taken together, these properties make it possible to design reliable and
extensible classes with multiple inheritance.  For more detail, see
:ref:`python_2.3_mro`.

In some cases multiple inheritance is not allowed; see :ref:`multiple-inheritance`
for details.

.. _tut-private:

Private Variables
=================

"Private" instance variables that cannot be accessed except from inside an
object don't exist in Python.  However, there is a convention that is followed
by most Python code: a name prefixed with an underscore (e.g. ``_spam``) should
be treated as a non-public part of the API (whether it is a function, a method
or a data member).  It should be considered an implementation detail and subject
to change without notice.

.. index::
   pair: name; mangling

Since there is a valid use-case for class-private members (namely to avoid name
clashes of names with names defined by subclasses), there is limited support for
such a mechanism, called :dfn:`name mangling`.  Any identifier of the form
``__spam`` (at least two leading underscores, at most one trailing underscore)
is textually replaced with ``_classname__spam``, where ``classname`` is the
current class name with leading underscore(s) stripped.  This mangling is done
without regard to the syntactic position of the identifier, as long as it
occurs within the definition of a class.

.. seealso::

   The :ref:`private name mangling specifications <private-name-mangling>`
   for details and special cases.

Name mangling is helpful for letting subclasses override methods without
breaking intraclass method calls.  For example::

   class Mapping:
       def __init__(self, iterable):
           self.items_list = []
           self.__update(iterable)

       def update(self, iterable):
           for item in iterable:
               self.items_list.append(item)

       __update = update   # private copy of original update() method

   class MappingSubclass(Mapping):

       def update(self, keys, values):
           # provides new signature for update()
           # but does not break __init__()
           for item in zip(keys, values):
               self.items_list.append(item)

The above example would work even if ``MappingSubclass`` were to introduce a
``__update`` identifier since it is replaced with ``_Mapping__update`` in the
``Mapping`` class  and ``_MappingSubclass__update`` in the ``MappingSubclass``
class respectively.

Note that the mangling rules are designed mostly to avoid accidents; it still is
possible to access or modify a variable that is considered private.  This can
even be useful in special circumstances, such as in the debugger.

Notice that code passed to ``exec()`` or ``eval()`` does not consider the
classname of the invoking class to be the current class; this is similar to the
effect of the ``global`` statement, the effect of which is likewise restricted
to code that is byte-compiled together.  The same restriction applies to
``getattr()``, ``setattr()`` and ``delattr()``, as well as when referencing
``__dict__`` directly.

.. _tut-odds:

Odds and Ends
=============

Sometimes it is useful to have a data type similar to the Pascal "record" or C
"struct", bundling together a few named data items. The idiomatic approach
is to use :mod:`dataclasses` for this purpose::

    from dataclasses import dataclass

    @dataclass
    class Employee:
        name: str
        dept: str
        salary: int

::

    >>> john = Employee('john', 'computer lab', 1000)
    >>> john.dept
    'computer lab'
    >>> john.salary
    1000

A piece of Python code that expects a particular abstract data type can often be
passed a class that emulates the methods of that data type instead.  For
instance, if you have a function that formats some data from a file object, you
can define a class with methods :meth:`~io.TextIOBase.read` and
:meth:`~io.TextIOBase.readline` that get the
data from a string buffer instead, and pass it as an argument.

.. (Unfortunately, this technique has its limitations: a class can't define
   operations that are accessed by special syntax such as sequence subscripting
   or arithmetic operators, and assigning such a "pseudo-file" to sys.stdin will
   not cause the interpreter to read further input from it.)

:ref:`Instance method objects <instance-methods>` have attributes, too:
:attr:`m.__self__ <method.__self__>` is the instance
object with the method :meth:`!m`, and :attr:`m.__func__ <method.__func__>` is
the :ref:`function object <user-defined-funcs>`
corresponding to the method.

.. _tut-iterators:

Iterators
=========

By now you have probably noticed that most container objects can be looped over
using a :keyword:`for` statement::

   for element in [1, 2, 3]:
       print(element)
   for element in (1, 2, 3):
       print(element)
   for key in {'one':1, 'two':2}:
       print(key)
   for char in "123":
       print(char)
   for line in open("myfile.txt"):
       print(line, end='')

This style of access is clear, concise, and convenient.  The use of iterators
pervades and unifies Python.  Behind the scenes, the :keyword:`for` statement
calls :func:`iter` on the container object.  The function returns an iterator
object that defines the method :meth:`~iterator.__next__` which accesses
elements in the container one at a time.  When there are no more elements,
:meth:`~iterator.__next__` raises a :exc:`StopIteration` exception which tells the
:keyword:`!for` loop to terminate.  You can call the :meth:`~iterator.__next__` method
using the :func:`next` built-in function; this example shows how it all works::

   >>> s = 'abc'
   >>> it = iter(s)
   >>> it
   <str_iterator object at 0x10c90e650>
   >>> next(it)
   'a'
   >>> next(it)
   'b'
   >>> next(it)
   'c'
   >>> next(it)
   Traceback (most recent call last):
     File "<stdin>", line 1, in <module>
       next(it)
   StopIteration

Having seen the mechanics behind the iterator protocol, it is easy to add
iterator behavior to your classes.  Define an :meth:`~container.__iter__` method which
returns an object with a :meth:`~iterator.__next__` method.  If the class
defines :meth:`!__next__`, then :meth:`!__iter__` can just return ``self``::

   class Reverse:
       """Iterator for looping over a sequence backwards."""
       def __init__(self, data):
           self.data = data
           self.index = len(data)

       def __iter__(self):
           return self

       def __next__(self):
           if self.index == 0:
               raise StopIteration
           self.index = self.index - 1
           return self.data[self.index]

::

   >>> rev = Reverse('spam')
   >>> iter(rev)
   <__main__.Reverse object at 0x00A1DB50>
   >>> for char in rev:
   ...     print(char)
   ...
   m
   a
   p
   s

.. _tut-generators:

Generators
==========

:term:`Generators <generator>` are a simple and powerful tool for creating iterators.  They
are written like regular functions but use the :keyword:`yield` statement
whenever they want to return data.  Each time :func:`next` is called on it, the
generator resumes where it left off (it remembers all the data values and which
statement was last executed).  An example shows that generators can be trivially
easy to create::

   def reverse(data):
       for index in range(len(data)-1, -1, -1):
           yield data[index]

::

   >>> for char in reverse('golf'):
   ...     print(char)
   ...
   f
   l
   o
   g

Anything that can be done with generators can also be done with class-based
iterators as described in the previous section.  What makes generators so
compact is that the :meth:`~iterator.__iter__` and :meth:`~generator.__next__` methods
are created automatically.

Another key feature is that the local variables and execution state are
automatically saved between calls.  This made the function easier to write and
much more clear than an approach using instance variables like ``self.index``
and ``self.data``.

In addition to automatic method creation and saving program state, when
generators terminate, they automatically raise :exc:`StopIteration`. In
combination, these features make it easy to create iterators with no more effort
than writing a regular function.

.. _tut-genexps:

Generator Expressions
=====================

Some simple generators can be coded succinctly as expressions using a syntax
similar to list comprehensions but with parentheses instead of square brackets.
These expressions are designed for situations where the generator is used right
away by an enclosing function.  Generator expressions are more compact but less
versatile than full generator definitions and tend to be more memory friendly
than equivalent list comprehensions.

Examples::

   >>> sum(i*i for i in range(10))                 # sum of squares
   285

   >>> xvec = [10, 20, 30]
   >>> yvec = [7, 5, 3]
   >>> sum(x*y for x,y in zip(xvec, yvec))         # dot product
   260

   >>> unique_words = set(word for line in page  for word in line.split())

   >>> valedictorian = max((student.gpa, student.name) for student in graduates)

   >>> data = 'golf'
   >>> list(data[i] for i in range(len(data)-1, -1, -1))
   ['f', 'l', 'o', 'g']

   >>> x = [[1,2,3], [], [4, 5]]
   >>> g = (*i for i in x)
   >>> list(g)
   [1, 2, 3, 4, 5]

In most cases, generator expressions must be wrapped in parentheses.  As a
special case, however, when provided as the sole argument to a function (as in
the examples involving ``sum``, ``set``, ``max``, and ``list`` above), the
generator expression does not need to be wrapped in an additional set of
parentheses.  That is to say, the following two pieces of code are semantically
equivalent::

   >>> f(x for x in y)
   >>> f((x for x in y))

as are the following::

   >>> f(*x for x in y)
   >>> f((*x for x in y))

.. rubric:: Footnotes

.. [#] Except for one thing.  Module objects have a secret read-only attribute called
   :attr:`~object.__dict__` which returns the dictionary used to implement the module's
   namespace; the name ``__dict__`` is an attribute but not a global name.
   Obviously, using this violates the abstraction of namespace implementation, and
   should be restricted to things like post-mortem debuggers.
